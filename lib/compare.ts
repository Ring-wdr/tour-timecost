/**
 * 비교 계산 (4장 절차).
 * 1) 직선거리 필터 → 2) 다중 목적지(30개씩, 캐시 7일) → 3) 점수 상위 20곳 단건 길찾기로 통행료(캐시 30일)
 * → 4) 상위 10곳 미래 운행 정보(토요일 09:00, 쿼터 여유 시) → 비용·점수.
 * 외부 API 실패/쿼터 차단 시: 만료된 캐시("최신 아님") → 없으면 직선거리 추정.
 */
import { sql } from "drizzle-orm";
import { cacheKey, getCache, getManyCache, setCache } from "@/lib/cache";
import { config } from "@/lib/config";
import { PREF_TYPES, type CompareInput } from "@/lib/compare-input";
import { estimateCost, tripDays, type CostBreakdown } from "@/lib/cost";
import { db } from "@/lib/db";
import { roundCoord, type LonLat } from "@/lib/geo";
import { latestGasolinePrice } from "@/lib/jobs";
import { createRouter, QuotaGuardError, type DirectionsSummary, type RouteSummary, type Router } from "@/lib/routing/kakao";
import { scoreCandidates, type Scored } from "@/lib/scoring";
import { useTourMock } from "@/lib/env";

export type RouteSource = "live" | "mock" | "estimate";

export interface Candidate {
  code: string;
  name: string;
  sidoName: string;
  lon: number;
  lat: number;
  straightKm: number;
  route: { distanceKm: number; durationS: number; source: RouteSource; stale: boolean };
  weekend: { durationS: number; departure: string; stale: boolean } | null;
  tollStatus: "calculated" | "not_calculated";
  cost: CostBreakdown;
  poi: { typeCounts: Record<string, number>; preferredCount: number; imageRatio: number; petCount: number; lodgingCount: number };
  festivals: { contentId: string; title: string; startDate: string; endDate: string }[];
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
    festivalBonus: number;
    tripDates: string[];
    weekendDeparture: string | null;
  };
  excluded: { byDistance: number; unreachable: string[] };
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
  return cacheKey("compare", { ...rest, origin: roundCoord(origin), routingSource });
}

export async function runCompare(input: CompareInput, router: Router = createRouter()): Promise<CompareResult> {
  const resultKey = compareCacheKey(input, router.source);
  const hit = await getCache<CompareResult>(resultKey);
  if (hit) {
    console.log(`[compare] 결과 캐시 HIT ${resultKey} (외부 API 호출 없음)`);
    const zero = { destinations: newCounter(), directions: newCounter(), future: newCounter() };
    return rescore({ ...hit.value, fromCache: true, calls: zero }, input);
  }
  console.log(`[compare] 결과 캐시 MISS ${resultKey}`);

  const origin = roundCoord(input.origin);
  const { days } = tripDays(input.tripType);
  const tripDates = Array.from({ length: days }, (_, i) => addDays(input.date, i));
  const maxKm = input.maxOneWayKm ?? config.search.maxOneWayKm[input.tripType];
  const calls: CompareResult["calls"] = { destinations: newCounter(), directions: newCounter(), future: newCounter() };
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
  const near = rows.filter((r) => r.straight_km <= maxKm);
  const byDistance = rows.length - near.length;
  console.log(`[compare] 후보 ${rows.length}곳 중 직선 ${maxKm}km 이내 ${near.length}곳`);

  // 2) 다중 목적지 (캐시 우선, 미스만 30개씩 호출)
  const destKey = (code: string) => cacheKey("kakao:destinations", { src: router.source, o: origin, d: code });
  const fresh = await getManyCache<RouteSummary>(near.map((r) => destKey(r.code)));
  const routes = new Map<string, { s: RouteSummary; source: RouteSource; stale: boolean }>();
  const misses: RegionRow[] = [];
  for (const r of near) {
    const c = fresh.get(destKey(r.code));
    if (c) {
      routes.set(r.code, { s: c.value, source: router.source, stale: false });
      calls.destinations!.cached++;
    } else misses.push(r);
  }
  for (let i = 0; i < misses.length; i += config.kakao.multiBatchSize) {
    const batch = misses.slice(i, i + config.kakao.multiBatchSize);
    try {
      const res = await router.destinations(
        origin,
        batch.map((r) => ({ lon: r.lon, lat: r.lat, key: r.code })),
      );
      calls.destinations!.fetched += batch.length;
      for (const r of batch) {
        const s = res.get(r.code) ?? { ok: false, resultCode: -1, distanceM: null, durationS: null };
        routes.set(r.code, { s, source: router.source, stale: false });
        await setCache(destKey(r.code), "kakao:destinations", s, config.kakao.ttlDays.destinations * DAY_MS / 1000);
      }
    } catch (e) {
      const blocked = e instanceof QuotaGuardError;
      console.warn(`[compare] 다중 목적지 실패(${batch.length}곳): ${(e as Error).message}`);
      const stale = await getManyCache<RouteSummary>(batch.map((r) => destKey(r.code)), { allowStale: true });
      for (const r of batch) {
        const c = stale.get(destKey(r.code));
        if (c) {
          routes.set(r.code, { s: c.value, source: router.source, stale: true });
          anyStale = true;
        } else {
          routes.set(r.code, { s: estimateRoute(r.straight_km), source: "estimate", stale: false });
        }
        if (blocked) calls.destinations!.blocked++;
        else calls.destinations!.failed++;
      }
    }
  }
  console.log(`[routing] 다중 목적지: 캐시 ${calls.destinations!.cached}곳, 외부 호출 ${calls.destinations!.fetched}곳 (${Math.ceil(calls.destinations!.fetched / config.kakao.multiBatchSize)}회)`);

  // 후보 조립
  const festivals = await db.execute<{ region_code: string; content_id: string; title: string; start_date: string; end_date: string }>(sql`
    SELECT region_code, content_id, title, start_date::text, end_date::text FROM festivals
    WHERE start_date <= ${tripDates.at(-1)!} AND end_date >= ${tripDates[0]!} AND region_code IS NOT NULL
    ORDER BY start_date
  `);
  const prefTypes = input.prefs.filter((p) => p !== "festival").map((p) => PREF_TYPES[p as keyof typeof PREF_TYPES]);
  const scoreTypes = prefTypes.length ? prefTypes : [12, 14, 28];

  const unreachable: string[] = [];
  const candidates: Candidate[] = [];
  for (const r of near) {
    const route = routes.get(r.code)!;
    if (!route.s.ok || route.s.distanceM === null || route.s.durationS === null) {
      unreachable.push(`${r.sido_name} ${r.name}`);
      continue;
    }
    const preferredCount = scoreTypes.reduce((s, t) => s + (r.type_counts[String(t)] ?? 0), 0);
    const fest = festivals.filter((f) => f.region_code === r.code);
    const c: Candidate = {
      code: r.code,
      name: r.name,
      sidoName: r.sido_name,
      lon: r.lon,
      lat: r.lat,
      straightKm: Math.round(r.straight_km * 10) / 10,
      route: { distanceKm: route.s.distanceM / 1000, durationS: route.s.durationS, source: route.source, stale: route.stale },
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
      festivals: fest.map((f) => ({ contentId: f.content_id, title: f.title, startDate: f.start_date, endDate: f.end_date })),
      imageUrl: r.image_url,
      scoreInput: { durationS: 0, totalCost: 0, poiCount: 0, hasFestival: false },
      score: null as unknown as Scored,
    };
    candidates.push(c);
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

  // 3) 점수 상위 20곳 통행료
  const ranked = scoreAll(candidates, input, festivalBonus);
  const topToll = ranked.slice(0, config.kakao.tollTopN);
  for (const c of topToll) {
    const key = cacheKey("kakao:directions", { src: router.source, o: origin, d: c.code });
    const r = await cachedCall<DirectionsSummary>(key, "kakao:directions", config.kakao.ttlDays.directions, calls.directions!, () =>
      router.directions(origin, { lon: c.lon, lat: c.lat }),
    );
    if (r?.value.ok && r.value.tollWon !== null) {
      c.cost = costOf(c, r.value.tollWon);
      c.tollStatus = "calculated";
      if (r.stale) anyStale = true;
    }
  }
  console.log(`[routing] 통행료 단건: 캐시 ${calls.directions!.cached}, 외부 호출 ${calls.directions!.fetched}`);

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
    sources: { tour: useTourMock() ? "mock" : "live", routing: router.source },
    assumptions: {
      fuelPricePerLiter: fuelPrice,
      fuelPriceSource,
      fuelEfficiencyKmPerL: input.fuelEfficiency > 0 ? input.fuelEfficiency : config.defaults.fuelEfficiencyKmPerL,
      lodgingPerNight,
      lodgingSource: input.lodgingPerNight === undefined ? "default" : "user",
      dailySpendPerPerson: dailySpend,
      dailySpendSource: input.dailySpendPerPerson === undefined ? "default" : "user",
      maxOneWayKm: maxKm,
      festivalBonus,
      tripDates,
      weekendDeparture,
    },
    excluded: { byDistance, unreachable },
    calls,
    candidates,
  };
  await setCache(resultKey, "compare", result, config.search.resultCacheMinutes * 60);
  return result;
}

/** 직선거리 기반 추정 (외부 API 불가 + 캐시 없음). 도로 계수 1.3, 평균 60km/h */
function estimateRoute(straightKm: number): RouteSummary {
  const km = straightKm * 1.3;
  return { ok: true, resultCode: 0, distanceM: Math.round(km * 1000), durationS: Math.round((km / 60) * 3600) };
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
      hasFestival: c.festivals.length > 0,
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
