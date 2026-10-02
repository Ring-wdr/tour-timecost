import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { isKakaoMock, isTourMock } from "@/lib/env";
import { lastSuccessfulRuns, tourDataSource } from "@/lib/ingest";
import { kstDay, usageToday } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (e) {
    return NextResponse.json({ ok: false, db: "down", error: (e as Error).message }, { status: 503 });
  }
  const [runs, usage, counts] = await Promise.all([
    lastSuccessfulRuns(),
    usageToday(),
    db.execute<{ regions: number; candidates: number; pois: number; festivals: number; cache: number }>(sql`
      SELECT (SELECT count(*)::int FROM regions) AS regions,
             (SELECT count(*)::int FROM regions WHERE is_candidate) AS candidates,
             (SELECT count(*)::int FROM pois) AS pois,
             (SELECT count(*)::int FROM festivals) AS festivals,
             (SELECT count(*)::int FROM api_cache) AS cache
    `),
  ]);
  return NextResponse.json({
    ok: true,
    db: "up",
    sources: { tourClient: isTourMock() ? "mock" : "live", tourData: await tourDataSource(), routing: isKakaoMock() ? "mock" : "live" },
    lastIngest: Object.fromEntries(runs.map((r) => [r.job, { finishedAt: r.finished_at, source: r.source }])),
    usageToday: {
      day: kstDay(),
      tour: { used: usage["tour"] ?? 0, limit: config.tour.dailyLimit },
      kakaoDirections: { used: usage["kakao:directions"] ?? 0, limit: config.kakao.dailyLimits.directions },
      kakaoFuture: { used: usage["kakao:future"] ?? 0, limit: config.kakao.dailyLimits.future },
    },
    data: counts[0],
  });
}
