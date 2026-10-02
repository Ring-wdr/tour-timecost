/**
 * 카카오모빌리티 길찾기 클라이언트 (자동차 단건 / 미래 운행 정보).
 *
 * - 엔드포인트·파라미터는 공식 문서(developers.kakaomobility.com/guide/navi-api, 2026-10-02 확인) 기준.
 *   키가 없어 응답은 실측 전 → zod로 검증해 형태가 다르면 명확히 실패한다.
 * - 다중 목적지/다중 출발지는 radius 최대 10km라 이 서비스(20~400km)에 쓸 수 없어 구현하지 않는다.
 * - 키가 없으면 MockRouter: 직선거리 기반 근사값. 결과에 source: "mock"이 붙는다.
 * - 일일 사용량(api_usage)이 무료 쿼터의 80%를 넘으면 새 호출을 막는다(QuotaGuardError).
 */
import { z } from "zod";
import { config } from "@/lib/config";
import { env, isKakaoMock } from "@/lib/env";
import { haversineKm, islandOf, type LonLat } from "@/lib/geo";
import { addUsage, getUsage } from "@/lib/usage";

export type KakaoApi = "directions" | "future";

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

export interface Router {
  source: "live" | "mock";
  directions(origin: LonLat, dest: LonLat): Promise<DirectionsSummary>;
  /** departure: YYYYMMDDHHMM, 현재 이후 (공식 문서) */
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

  async future(origin: LonLat, dest: LonLat, departure: string) {
    await guardQuota("future");
    return toDirections(
      await this.request(`/v1/future/directions?origin=${xy(origin)}&destination=${xy(dest)}&departure_time=${departure}&summary=true`),
    );
  }
}

/**
 * Mock: 실제 경로가 아니다. 도로 계수 1.35, 평균 속도(근거리 38km/h, 원거리 70km/h) + 출발/도착 10분.
 * 통행료는 50km 이상 구간에 km당 45원 근사. 제주·울릉 ↔ 육지는 길 없음(result_code 104로 흉내).
 */
export class MockRouter implements Router {
  source = "mock" as const;

  private summary(origin: LonLat, dest: LonLat, slowdown = 1): DirectionsSummary {
    // 섬 ↔ 육지: 결과 없음(1), 5m 이내: 104 (공식 결과 코드)
    if (islandOf(origin) !== islandOf(dest)) return { ok: false, resultCode: 1, distanceM: null, durationS: null, tollWon: null };
    const straight = haversineKm(origin, dest);
    if (straight < 0.005) return { ok: false, resultCode: 104, distanceM: null, durationS: null, tollWon: null };
    // 추정 모델과 일부러 조금 다르게(도로 계수 1.35, 속도 70) — 보정 로직이 실제로 동작하는지 볼 수 있게
    const km = straight * 1.35;
    const durationS = Math.round(((km / (km > 60 ? 70 : 38)) * 3600 + 600) * slowdown);
    const tollWon = km >= 50 ? Math.round((km * 45) / 100) * 100 : 0;
    return { ok: true, resultCode: 0, distanceM: Math.round(km * 1000), durationS, tollWon };
  }

  async directions(origin: LonLat, dest: LonLat) {
    return this.summary(origin, dest);
  }
  async future(origin: LonLat, dest: LonLat) {
    // 토요일 오전 정체 근사 +18%
    return this.summary(origin, dest, 1.18);
  }
}

export function createRouter(): Router {
  return isKakaoMock() ? new MockRouter() : new LiveRouter(env.KAKAO_REST_KEY!);
}
