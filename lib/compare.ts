/**
 * 비교 계산 (4장 절차, 다중 목적지 반경 제한 때문에 2~3단계를 바꿈 — docs/api-notes.md §2).
 * 1) 직선거리 필터 → 2) 전 후보 직선거리 추정 → 3) 예비 점수 상위 40곳 자동차 길찾기(거리·시간·통행료, 캐시 30일)
 * → 4) 나머지 추정을 실측 비율로 보정 → 5) 상위 10곳 미래 운행 정보(선택 날짜 09:00) → 비용·점수.
 * 외부 API 실패/쿼터 차단 시: 만료된 캐시("최신 아님") → 없으면 보정 없는 직선거리 추정.
 */
import { sql } from "drizzle-orm";
import { cacheKey, getCache, setCache } from "@/lib/cache";
import { config } from "@/lib/config";
import { PREF_TYPES, type CompareInput } from "@/lib/compare-input";
import { estimateCost, tripDays, type CostBreakdown } from "@/lib/cost";
import { db } from "@/lib/db";
import { islandOf, roundCoord } from "@/lib/geo";
import { latestGasolinePrice } from "@/lib/jobs";
import { estimateRoute, median } from "@/lib/routing/estimate";
import { createRouter, QuotaGuardError, type DirectionsSummary, type Router } from "@/lib/routing/kakao";
import { scoreCandidates, type Scored } from "@/lib/scoring";
import { tourDataSource } from "@/lib/ingest";

export type RouteSource = "live" | "mock" | "estimate";

export interface Candidate {
  code: string;
  name: string;
  sidoName: string;
  lon: number;
  lat: number;
  straightKm: number;
  /** source=estimate면 직선거리 추정 (calibrated: 실측 비율로 보정됨) */
  route: { distanceKm: number; durationS: number; source: RouteSource; stale: boolean; calibrated: boolean };
  weekend: { durationS: number; departure: string; stale: boolean } | null;
  tollStatus: "calculated" | "not_calculated";
  cost: CostBreakdown;
  poi: { typeCounts: Record<string, number>; preferredCount: number; imageRatio: number; petCount: number; lodgingCount: number };
  festivals: { contentId: string; title: string; startDate: string; endDate: string; longRunning: boolean }[];
  imageUrl: string | null;
  scoreInput: { durationS: number; totalCost: number; poiCount: number; hasFestival: boolean };
  score: Scored;
}

export interface CompareResult {
  generatedAt: string;
  fromCache: boolean;
  stale: boolean;
  sources: { tour: "live" | "mock"; routing: "live" | "mock" };
  assumptions: {
    fuelPricePerLiter: number;
    fuelPriceSource: "user" | "opinet" | "default";
    fuelEfficiencyKmPerL: number;
    lodgingPerNight: number;
    lodgingSource: "user" | "default";
    dailySpendPerPerson: number;
    dailySpendSource: "user" | "default";
    maxOneWayKm: number;
    minOneWayKm: number;
    festivalBonus: number;
    tripDates: string[];
    weekendDeparture: string | null;
  };
  excluded: { byDistance: number; tooClose: number; unreachable: string[] };
  calls: Record<string, { cached: number; fetched: number; failed: number; blocked: number }>;
  candidates: Candidate[];
}

type RegionRow = {
  code: string;
  name: string;
  sido_name: string;
  lon: number;
  lat: number;
  type_counts: Record<string, number>;
  image_ratio: number;
  pet_count: number;
  straight_km: number;
  image_url: string | null;
};

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

function newCounter() {
  return { cached: 0, fetched: 0, failed: 0, blocked: 0 };
}

/** 같은 입력(가중치 제외)이면 10분간 결과 캐시. 가중치는 클라이언트에서 재정렬한다. */
export function compareCacheKey(input: CompareInput, routingSource: string) {
  const { weights: _w, origin, ...rest } = input;
  void _w;
  // 기본값이 바뀌면 캐시도 갈리도록 해석된 값과 버전을 키에 넣는다
  return cacheKey("compare", {
    v: 4,
    ...rest,
    origin: roundCoord(origin),
    routingSource,
    minKm: rest.minOneWayKm ?? config.search.minOneWayKm,
    maxKm: rest.maxOneWayKm ?? config.search.maxOneWayKm[rest.tripType],
  });
}

export async function runCompare(input: CompareInput, router: Router = createRouter()): Promise<CompareResult> {
  const resultKey = compareCacheKey(input, router.source);
  const hit = await getCache<CompareResult>(resultKey);
  if (hit) {
    console.log(`[compare] 결과 캐시 HIT ${resultKey} (외부 API 호출 없음)`);
    const zero = { directions: newCounter(), future: newCounter() };
    return rescore({ ...hit.value, fromCache: true, calls: zero }, input);
  }
  console.log(`[compare] 결과 캐시 MISS ${resultKey}`);

  const origin = roundCoord(input.origin);
  const { days } = tripDays(input.tripType);
  const tripDates = Array.from({ length: days }, (_, i) => addDays(input.date, i));
  const maxKm = input.maxOneWayKm ?? config.search.maxOneWayKm[input.tripType];
  const calls: CompareResult["calls"] = { directions: newCounter(), future: newCounter() };
  let anyStale = false;

  // 가정값
  const opinet = input.fuelPrice === undefined ? await latestGasolinePrice() : null;
  const fuelPrice = input.fuelPrice ?? opinet?.price ?? config.defaults.fuelPricePerLiter;
  const fuelPriceSource = input.fuelPrice !== undefined ? "user" : opinet ? "opinet" : "default";
  const lodgingPerNight = input.lodgingPerNight ?? config.defaults.lodgingPerNight;
  const dailySpend = input.dailySpendPerPerson ?? config.defaults.dailySpendPerPerson;
  const festivalBonus = input.prefs.includes("festival") ? config.defaults.festivalBonus : 0;

  // 1) 직선거리 필터
  const rows = await db.execute<RegionRow>(sql`
    SELECT r.code, r.name, r.sido_name, r.lon, r.lat, r.type_counts, r.image_ratio, r.pet_count,
      ST_Distance(r.geom, ST_SetSRID(ST_MakePoint(${origin.lon}, ${origin.lat}), 4326)::geography) / 1000 AS straight_km,
      (SELECT p.image_url FROM pois p WHERE p.region_code = r.code AND p.content_type_id = 12 AND p.image_url IS NOT NULL
        ORDER BY p.content_id LIMIT 1) AS image_url
    FROM regions r WHERE r.is_candidate
  `);
  const minKm = input.minOneWayKm ?? config.search.minOneWayKm;
  const near = rows.filter((r) => r.straight_km <= maxKm && r.straight_km >= minKm);
  const tooClose = rows.filter((r) => r.straight_km < minKm).length;
  const byDistance = rows.length - near.length - tooClose;
  console.log(`[compare] 후보 ${rows.length}곳 중 직선 ${minKm}~${maxKm}km ${near.length}곳`);

  // 2) 모든 후보는 먼저 직선거리 기반 추정으로 채운다.
  //    카카오 다중 목적지·다중 출발지는 radius 최대 10km(공식 문서)라 20~400km 비교에 쓸 수 없다.
  const festivals = await db.execute<{ region_code: string; content_id: string; title: string; start_date: string; end_date: string }>(sql`
    SELECT region_code, content_id, title, start_date::text, end_date::text FROM festivals
    WHERE start_date <= ${tripDates.at(-1)!} AND end_date >= ${tripDates[0]!} AND region_code IS NOT NULL
    ORDER BY start_date
  `);
  const prefTypes = input.prefs.filter((p) => p !== "festival").map((p) => PREF_TYPES[p as keyof typeof PREF_TYPES]);
  const scoreTypes = prefTypes.length ? prefTypes : [12, 14, 28];

  const unreachable: string[] = [];
  let candidates: Candidate[] = [];
  for (const r of near) {
    if (islandOf(r) !== islandOf(origin)) {
      unreachable.push(`${r.sido_name} ${r.name}`);
      continue;
    }
    const est = estimateRoute(r.straight_km);
    const preferredCount = scoreTypes.reduce((s, t) => s + (r.type_counts[String(t)] ?? 0), 0);
    const fest = festivals.filter((f) => f.region_code === r.code);
    candidates.push({
      code: r.code,
      name: r.name,
      sidoName: r.sido_name,
      lon: r.lon,
      lat: r.lat,
      straightKm: Math.round(r.straight_km * 10) / 10,
      route: { distanceKm: est.distanceKm, durationS: est.durationS, source: "estimate", stale: false, calibrated: false },
      weekend: null,
      tollStatus: "not_calculated",
      cost: null as unknown as CostBreakdown,
      poi: {
        typeCounts: r.type_counts,
        preferredCount,
        imageRatio: r.image_ratio,
        petCount: r.pet_count,
        lodgingCount: r.type_counts["32"] ?? 0,
      },
      festivals: fest.map((f) => ({
        contentId: f.content_id,
        title: f.title,
        startDate: f.start_date,
        endDate: f.end_date,
        longRunning: (Date.parse(f.end_date) - Date.parse(f.start_date)) / DAY_MS > config.defaults.festivalMaxDays,
      })),
      imageUrl: r.image_url,
      scoreInput: { durationS: 0, totalCost: 0, poiCount: 0, hasFestival: false },
      score: null as unknown as Scored,
    });
  }

  const costOf = (c: Candidate, toll: number | null) =>
    estimateCost({
      oneWayKm: c.route.distanceKm,
      tollOneWay: toll,
      tripType: input.tripType,
      people: input.people,
      budget: input.budget,
      fuelPricePerLiter: fuelPrice,
      fuelEfficiencyKmPerL: input.fuelEfficiency,
      lodgingPerNight,
      dailySpendPerPerson: dailySpend,
    });
  for (const c of candidates) c.cost = costOf(c, null);

  // 3) 예비 점수 상위 N곳만 자동차 길찾기 단건 → 실제 거리·시간·통행료 (캐시 30일)
  const ratios = { d: [] as number[], t: [] as number[] };
  const noRoute = new Set<string>();
  for (const c of scoreAll(candidates, input, festivalBonus).slice(0, config.kakao.routeTopN)) {
    const key = cacheKey("kakao:directions", { src: router.source, o: origin, d: c.code });
    const r = await cachedCall<DirectionsSummary>(key, "kakao:directions", config.kakao.ttlDays.directions, calls.directions!, () =>
      router.directions(origin, { lon: c.lon, lat: c.lat }),
    );
    if (!r) continue; // 외부 실패 + 캐시 없음 → 추정 유지
    if (!r.value.ok || r.value.distanceM === null || r.value.durationS === null) {
      noRoute.add(c.code);
      unreachable.push(`${c.sidoName} ${c.name}`);
      continue;
    }
    ratios.d.push(r.value.distanceM / 1000 / c.route.distanceKm);
    ratios.t.push(r.value.durationS / c.route.durationS);
    c.route = { distanceKm: r.value.distanceM / 1000, durationS: r.value.durationS, source: router.source, stale: r.stale, calibrated: false };
    c.cost = costOf(c, r.value.tollWon);
    c.tollStatus = "calculated";
    if (r.stale) anyStale = true;
  }
  candidates = candidates.filter((c) => !noRoute.has(c.code));
  console.log(`[routing] 자동차 길찾기 상위 ${config.kakao.routeTopN}곳: 캐시 ${calls.directions!.cached}, 외부 호출 ${calls.directions!.fetched}`);

  // 4) 나머지 추정치를 이번 출발지의 실측/추정 비율 중앙값으로 보정 (표본 3개 이상일 때)
  const kd = ratios.d.length >= 3 ? median(ratios.d) : null;
  const kt = ratios.t.length >= 3 ? median(ratios.t) : null;
  if (kd && kt) {
    for (const c of candidates) {
      if (c.route.source !== "estimate") continue;
      c.route = { ...c.route, distanceKm: c.route.distanceKm * kd, durationS: Math.round(c.route.durationS * kt), calibrated: true };
      c.cost = costOf(c, null);
    }
  }

  // 4) 상위 10곳 주말 출발 소요시간 (선택 날짜 09:00, 미래일 때만)
  const departureIso = `${input.date}T09:00:00+09:00`;
  const weekendDeparture = Date.parse(departureIso) > Date.now() ? input.date.replaceAll("-", "") + "0900" : null;
  if (weekendDeparture) {
    const top10 = scoreAll(candidates, input, festivalBonus).slice(0, config.kakao.futureTopN);
    for (const c of top10) {
      const key = cacheKey("kakao:future", { src: router.source, o: origin, d: c.code, t: weekendDeparture });
      const r = await cachedCall<DirectionsSummary>(key, "kakao:future", config.kakao.ttlDays.future, calls.future!, () =>
        router.future(origin, { lon: c.lon, lat: c.lat }, weekendDeparture),
      );
      if (r?.value.ok && r.value.durationS !== null) c.weekend = { durationS: r.value.durationS, departure: weekendDeparture, stale: r.stale };
    }
    console.log(`[routing] 미래 운행: 캐시 ${calls.future!.cached}, 외부 호출 ${calls.future!.fetched}`);
  }

  scoreAll(candidates, input, festivalBonus);
  candidates.sort((a, b) => b.score.score - a.score.score);

  const result: CompareResult = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    stale: anyStale || candidates.some((c) => c.route.stale),
    sources: { tour: (await tourDataSource()) ?? "mock", routing: router.source },
    assumptions: {
      fuelPricePerLiter: fuelPrice,
      fuelPriceSource,
      fuelEfficiencyKmPerL: input.fuelEfficiency > 0 ? input.fuelEfficiency : config.defaults.fuelEfficiencyKmPerL,
      lodgingPerNight,
      lodgingSource: input.lodgingPerNight === undefined ? "default" : "user",
      dailySpendPerPerson: dailySpend,
      dailySpendSource: input.dailySpendPerPerson === undefined ? "default" : "user",
      maxOneWayKm: maxKm,
      minOneWayKm: minKm,
      festivalBonus,
      tripDates,
      weekendDeparture,
    },
    excluded: { byDistance, tooClose, unreachable },
    calls,
    candidates,
  };
  await setCache(resultKey, "compare", result, config.search.resultCacheMinutes * 60);
  return result;
}

async function cachedCall<T>(
  key: string,
  namespace: string,
  ttlDays: number,
  counter: { cached: number; fetched: number; failed: number; blocked: number },
  fn: () => Promise<T>,
): Promise<{ value: T; stale: boolean } | null> {
  const hit = await getCache<T>(key);
  if (hit) {
    counter.cached++;
    return { value: hit.value, stale: false };
  }
  try {
    const value = await fn();
    counter.fetched++;
    await setCache(key, namespace, value, ttlDays * 86_400);
    return { value, stale: false };
  } catch (e) {
    if (e instanceof QuotaGuardError) counter.blocked++;
    else counter.failed++;
    const stale = await getCache<T>(key, { allowStale: true });
    return stale ? { value: stale.value, stale: true } : null;
  }
}

function poiCountFor(c: Candidate, input: CompareInput) {
  // 반려동물 선택 시 동반 가능 장소에 가중 (미수집 장소는 0으로 취급)
  return c.poi.preferredCount + (input.pet ? 2 * c.poi.petCount : 0);
}

function scoreAll(candidates: Candidate[], input: CompareInput, festivalBonus: number): Candidate[] {
  for (const c of candidates) {
    c.scoreInput = {
      durationS: c.route.durationS,
      totalCost: c.cost.total,
      poiCount: poiCountFor(c, input),
      hasFestival: c.festivals.some((f) => !f.longRunning),
    };
  }
  const scored = scoreCandidates(
    candidates.map((c) => ({ id: c.code, ...c.scoreInput })),
    input.weights,
    { festivalBonus },
  );
  const byId = new Map(scored.map((s) => [s.id, s]));
  for (const c of candidates) c.score = byId.get(c.code)!;
  return [...candidates].sort((a, b) => b.score.score - a.score.score);
}

/** 캐시된 결과에 요청 가중치로 점수만 다시 매긴다 */
function rescore(result: CompareResult, input: CompareInput): CompareResult {
  const candidates = scoreAll(result.candidates, input, result.assumptions.festivalBonus);
  return { ...result, candidates };
}
