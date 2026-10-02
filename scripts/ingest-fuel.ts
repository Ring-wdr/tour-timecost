/** pnpm ingest:fuel — 오피넷 전국 평균 유가 (키 없으면 건너뜀) */
import "dotenv/config";
import { closeDb } from "@/lib/db";
import { refreshFuel } from "@/lib/jobs";

try {
  console.log("[ingest:fuel]", await refreshFuel());
} catch (e) {
  console.error("[ingest:fuel] 실패", e);
  process.exitCode = 1;
} finally {
  await closeDb();
}
