import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { purgeExpiredCache, refreshFestivals, refreshFuel } from "@/lib/jobs";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  if (!env.CRON_SECRET) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** 축제 갱신 → 유가 갱신 → 오래된 캐시 정리. 단계별 실패는 다음 단계를 막지 않는다. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const steps: Record<string, unknown> = {};
  for (const [name, fn] of [
    ["festivals", refreshFestivals],
    ["fuel", refreshFuel],
    ["cache", purgeExpiredCache],
  ] as const) {
    try {
      steps[name] = { ok: true, ...(await fn()) };
    } catch (e) {
      steps[name] = { ok: false, error: (e as Error).message };
    }
  }
  return NextResponse.json({ ok: Object.values(steps).every((s) => (s as { ok: boolean }).ok), steps });
}
