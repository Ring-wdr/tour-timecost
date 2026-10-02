/**
 * 카카오모빌리티 길찾기 클라이언트 (자동차 단건 / 다중 목적지 / 미래 운행 정보).
 *
 * - 엔드포인트·요청 형식 중 다중 목적지/미래 운행 정보는 공식 문서 미확인 (docs/api-notes.md).
 *   응답은 zod로 검증해 형태가 다르면 명확히 실패한다.
 * - 키가 없으면 MockRouter: 직선거리 기반 근사값. 결과에 source: "mock"이 붙는다.
 * - 일일 사용량(api_usage)이 무료 쿼터의 80%를 넘으면 새 호출을 막는다(QuotaGuardError).
 */
import { z } from "zod";
import { config } from "@/lib/config";
import { env, useKakaoMock } from "@/lib/env";
import { haversineKm, isJeju, type LonLat } from "@/lib/geo";
import { addUsage, getUsage } from "@/lib/usage";

export type KakaoApi = "directions" | "destinations" | "future";

export class QuotaGuardError extends Error {
  constructor(public api: KakaoApi, used: number, limit: number) {
    super(`카카오 ${api} 오늘 ${used}/${limit}건 — 쿼터 80% 초과로 새 호출 차단`);
  }
}
export class RoutingError extends Error {}

export interface RouteSummary {
  /** result_code != 0 이면 ok=false (길 없음, 출발=도착 등) */
  ok: boolean;
  resultCode: number;
  distanceM: number | null;
  durationS: number | null;
}
export interface DirectionsSummary extends RouteSummary {
  tollWon: number | null;
}
export interface Destination extends LonLat {
  key: string;
}

export interface Router {
  source: "live" | "mock";
  directions(origin: LonLat, dest: LonLat): Promise<DirectionsSummary>;
  /** 최대 30개 */
  destinations(origin: LonLat, dests: Destination[]): Promise<Map<string, RouteSummary>>;
  /** departure: YYYYMMDDHHmm (형식 미확인) */
  future(origin: LonLat, dest: LonLat, departure: string): Promise<DirectionsSummary>;
}

/** 쿼터 확인 후 사용량 증가. mock은 쿼터를 쓰지 않는다. */
export async function guardQuota(api: KakaoApi) {
  const limit = config.kakao.dailyLimits[api];
  const used = await getUsage(`kakao:${api}`);
  if (used >= limit * config.kakao.guardRatio) throw new QuotaGuardError(api, used, limit);
  await addUsage(`kakao:${api}`);
}

const xy = (p: LonLat) => `${p.lon},${p.lat}`;

const summarySchema = z.object({
  distance: z.number(),
  duration: z.number(),
  fare: z.object({ toll: z.number().optional(), taxi: z.number().optional() }).optional(),
});
const directionsSchema = z.object({
  routes: z
    .array(
      z.object({
        result_code: z.number(),
        result_msg: z.string().optional(),
        summary: summarySchema.optional(),
      }),
    )
    .min(1),
});
const destinationsSchema = z.object({
  routes: z.array(
    z.object({
      key: z.string(),
      result_code: z.number(),
      summary: z.object({ distance: z.number(), duration: z.number() }).optional(),
    }),
  ),
});

function toDirections(json: unknown): DirectionsSummary {
  const r = directionsSchema.parse(json).routes[0]!;
  const ok = r.result_code === 0 && !!r.summary;
  return {
    ok,
    resultCode: r.result_code,
    distanceM: ok ? r.summary!.distance : null,
    durationS: ok ? r.summary!.duration : null,
    tollWon: ok ? (r.summary!.fare?.toll ?? 0) : null,
  };
}

class LiveRouter implements Router {
  source = "live" as const;
  constructor(private key: string) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${config.kakao.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `KakaoAK ${this.key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new RoutingError(`카카오 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  async directions(origin: LonLat, dest: LonLat) {
    await guardQuota("directions");
    return toDirections(await this.request(`/v1/directions?origin=${xy(origin)}&destination=${xy(dest)}&summary=true`));
  }

  async destinations(origin: LonLat, dests: Destination[]) {
    if (dests.length > config.kakao.multiBatchSize) throw new RoutingError("다중 목적지는 최대 30개");
    await guardQuota("destinations");
    // 미확인: 요청 바디 형식과 radius 상한
    const json = await this.request(`/v1/destinations/directions`, {
      method: "POST",
      body: JSON.stringify({
        origin: { x: origin.lon, y: origin.lat },
        destinations: dests.map((d) => ({ x: d.lon, y: d.lat, key: d.key })),
        radius: config.search.maxOneWayKm.overnight * 1000,
        priority: "TIME",
      }),
    });
    const out = new Map<string, RouteSummary>();
    for (const r of destinationsSchema.parse(json).routes) {
      const ok = r.result_code === 0 && !!r.summary;
      out.set(r.key, { ok, resultCode: r.result_code, distanceM: ok ? r.summary!.distance : null, durationS: ok ? r.summary!.duration : null });
    }
    return out;
  }

  async future(origin: LonLat, dest: LonLat, departure: string) {
    await guardQuota("future");
    // 미확인: 엔드포인트와 departure_time 형식
    return toDirections(
      await this.request(`/v1/future/directions?origin=${xy(origin)}&destination=${xy(dest)}&departure_time=${departure}&summary=true`),
    );
  }
}

/**
 * Mock: 실제 경로가 아니다. 도로 계수 1.3, 평균 속도(근거리 40km/h, 원거리 75km/h) + 출발/도착 10분.
 * 통행료는 50km 이상 구간에 km당 45원 근사. 제주 ↔ 육지는 길 없음(result_code 104로 흉내).
 */
export class MockRouter implements Router {
  source = "mock" as const;

  private summary(origin: LonLat, dest: LonLat, slowdown = 1): DirectionsSummary {
    if (isJeju(origin) !== isJeju(dest)) return { ok: false, resultCode: 104, distanceM: null, durationS: null, tollWon: null };
    const km = haversineKm(origin, dest) * 1.3;
    if (km < 0.05) return { ok: false, resultCode: 104, distanceM: null, durationS: null, tollWon: null };
    const speed = km > 60 ? 75 : 40;
    const durationS = Math.round(((km / speed) * 3600 + 600) * slowdown);
    const tollWon = km >= 50 ? Math.round((km * 45) / 100) * 100 : 0;
    return { ok: true, resultCode: 0, distanceM: Math.round(km * 1000), durationS, tollWon };
  }

  async directions(origin: LonLat, dest: LonLat) {
    return this.summary(origin, dest);
  }
  async destinations(origin: LonLat, dests: Destination[]) {
    if (dests.length > config.kakao.multiBatchSize) throw new RoutingError("다중 목적지는 최대 30개");
    return new Map(dests.map((d) => [d.key, this.summary(origin, d)] as const));
  }
  async future(origin: LonLat, dest: LonLat) {
    // 토요일 오전 정체 근사 +18%
    return this.summary(origin, dest, 1.18);
  }
}

export function createRouter(): Router {
  return useKakaoMock() ? new MockRouter() : new LiveRouter(env.KAKAO_REST_KEY!);
}
