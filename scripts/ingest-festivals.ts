/** pnpm ingest:festivals — 오늘부터 60일 범위 축제 갱신 (하루 1회) */
import "dotenv/config";
import { closeDb } from "@/lib/db";
import { refreshFestivals } from "@/lib/jobs";

try {
  console.log("[ingest:festivals]", await refreshFestivals());
} catch (e) {
  console.error("[ingest:festivals] 실패", e);
  process.exitCode = 1;
} finally {
  await closeDb();
}
