/**
 * DB 통합 테스트: 로컬 Postgres에 픽스처가 적재돼 있을 때만 돈다 (pnpm ingest:tour 후).
 * 외부 API는 부르지 않는다 — 호출 횟수를 세는 가짜 라우터를 주입한다.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Router } from "@/lib/routing/kakao";
import { MockRouter, QuotaGuardError } from "@/lib/routing/kakao";
import { compareInputSchema } from "@/lib/compare-input";

let ready = false;
let db: typeof import("@/lib/db")["db"];
let closeDb: () => Promise<void>;
try {
  ({ db, closeDb } = await import("@/lib/db"));
  const [row] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM regions WHERE is_candidate`);
  ready = (row?.n ?? 0) > 0;
} catch {
  ready = false;
}

class CountingRouter implements Router {
  source = "mock" as const;
  calls = { directions: 0, future: 0 };
  inner = new MockRouter();
  fail = false;
  async directions(o: Parameters<Router["directions"]>[0], d: Parameters<Router["directions"]>[1]) {
    this.calls.directions++;
    if (this.fail) throw new QuotaGuardError("directions", 8000, 10000);
    return this.inner.directions(o, d);
  }
  async future(o: Parameters<Router["future"]>[0], d: Parameters<Router["future"]>[1]) {
    this.calls.future++;
    if (this.fail) throw new Error("network down");
    return this.inner.future(o, d);
  }
}

// 테스트 전용 좌표 (다른 데이터와 캐시 키가 겹치지 않게)
const input = compareInputSchema.parse({
  origin: { lon: 127.3851, lat: 36.3504 },
  date: "2099-01-03",
  tripType: "daytrip",
  people: 2,
  budget: 300_000,
  prefs: ["nature"],
});
const wipe = () => db.execute(sql`DELETE FROM api_cache WHERE namespace IN ('compare', 'kakao:directions', 'kakao:future')`);

describe.skipIf(!ready)("runCompare (DB 통합)", () => {
  beforeAll(wipe);
  afterAll(wipe);

  it("같은 입력 두 번째는 외부 호출 없이 결과 캐시로 응답", async () => {
    const { runCompare } = await import("@/lib/compare");
    const r = new CountingRouter();
    const first = await runCompare(input, r);
    const after1 = { ...r.calls };
    expect(after1.directions).toBeGreaterThan(0);
    expect(after1.directions).toBeLessThanOrEqual(40);
    expect(after1.future).toBeLessThanOrEqual(10);
    expect(first.candidates.length).toBeGreaterThan(0);

    const second = await runCompare({ ...input, weights: { time: 0, cost: 0, poi: 1 } }, r);
    expect(second.fromCache).toBe(true);
    expect(r.calls).toEqual(after1);
    // 가중치만 바꾸면 같은 캐시에서 재정렬
    expect(second.candidates[0]!.score.normalized.poi).toBe(1);
  });

  it("결과 캐시가 없어도 경로 캐시가 있으면 외부 호출 없음 (예산만 변경)", async () => {
    const { runCompare } = await import("@/lib/compare");
    const r = new CountingRouter();
    const res = await runCompare({ ...input, budget: 123_000 }, r);
    expect(res.fromCache).toBe(false);
    expect(r.calls).toEqual({ directions: 0, future: 0 });
  });

  it("외부 API 장애 시 만료 캐시로 응답하고 stale 표시", async () => {
    const { runCompare } = await import("@/lib/compare");
    await db.execute(sql`UPDATE api_cache SET expires_at = now() - interval '1 day' WHERE namespace LIKE 'kakao:%'`);
    await db.execute(sql`DELETE FROM api_cache WHERE namespace = 'compare'`);
    const r = new CountingRouter();
    r.fail = true;
    const res = await runCompare({ ...input, budget: 222_000 }, r);
    expect(res.stale).toBe(true);
    expect(res.candidates.some((c) => c.route.stale)).toBe(true);
    expect(res.calls.directions!.blocked).toBeGreaterThan(0);
  });

  it("상위 40곳만 실측, 나머지는 실측/추정 비율로 보정된 추정", async () => {
    const { runCompare } = await import("@/lib/compare");
    await wipe();
    const res = await runCompare({ ...input, budget: 333_000 }, new CountingRouter());
    const live = res.candidates.filter((c) => c.route.source === "mock");
    const est = res.candidates.filter((c) => c.route.source === "estimate");
    expect(live.length).toBeLessThanOrEqual(40);
    expect(live.every((c) => c.tollStatus === "calculated")).toBe(true);
    if (est.length) {
      expect(est.every((c) => c.route.calibrated && c.tollStatus === "not_calculated")).toBe(true);
      // MockRouter 도로 계수 1.35 vs 추정 1.3 → 보정 후 거리 ≈ 직선 × 1.35
      const c = est[0]!;
      expect(c.route.distanceKm / c.straightKm).toBeCloseTo(1.35, 1);
    }
  });

  it("캐시도 없고 외부도 실패하면 직선거리 추정으로 표시", async () => {
    const { runCompare } = await import("@/lib/compare");
    await wipe();
    const r = new CountingRouter();
    r.fail = true;
    const res = await runCompare({ ...input, budget: 111_000 }, r);
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.candidates.every((c) => c.route.source === "estimate" && !c.route.calibrated)).toBe(true);
    expect(res.candidates.every((c) => c.tollStatus === "not_calculated")).toBe(true);
    expect(res.calls.directions!.blocked).toBeGreaterThan(0);
  });
});

describe.skipIf(!ready)("카카오 쿼터 가드 (DB 통합)", () => {
  it("80% 이상이면 새 호출 차단, 미만이면 통과하며 사용량 +1", async () => {
    const { getUsage, kstDay } = await import("@/lib/usage");
    const { guardQuota } = await import("@/lib/routing/kakao");
    const today = kstDay();
    const before = await getUsage("kakao:future", today);
    const setCount = (n: number) =>
      db.execute(sql`INSERT INTO api_usage (day, api, count) VALUES (${today}, 'kakao:future', ${n})
        ON CONFLICT (day, api) DO UPDATE SET count = ${n}`);
    try {
      await setCount(4000); // 5000 × 0.8
      await expect(guardQuota("future")).rejects.toBeInstanceOf(QuotaGuardError);
      await setCount(3999);
      await guardQuota("future");
      expect(await getUsage("kakao:future", today)).toBe(4000);
    } finally {
      await setCount(before);
    }
  });
});

afterAll(async () => {
  if (ready) await closeDb();
});
