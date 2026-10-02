/**
 * pnpm ingest:pet — detailPetTour2로 반려동물 동반 정보 수집.
 * 장소당 1회 호출이라 전국 수집은 한도상 불가 → 후보 시군구의 관광지·음식점·숙박 중 미수집 건만
 * 실행당 PET_BUDGET(기본 300)건씩 나눠 채운다.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, closeDb } from "@/lib/db";
import { finishRun, startRun } from "@/lib/ingest";
import { computeRegions } from "@/lib/regions";
import { createTourClient, TourQuotaError } from "@/lib/tour/client";
import { QuotaStop, tourCall } from "@/lib/tour/quota";
import { parsePetAllowed } from "@/lib/tour/schema";

const budget = Number(process.env.PET_BUDGET || 300);
const client = createTourClient();
const runId = await startRun("pet", client.source);
const stats = { checked: 0, allowed: 0, notAllowed: 0, unknown: 0 };

try {
  const targets = await db.execute<{ content_id: string }>(sql`
    SELECT p.content_id FROM pois p JOIN regions r ON r.code = p.region_code
    WHERE r.is_candidate AND p.pet_info IS NULL AND p.content_type_id IN (12, 39, 32)
    ORDER BY p.content_type_id, p.content_id LIMIT ${budget}
  `);
  for (const { content_id } of targets) {
    const item = await tourCall(client, `detailPetTour2 ${content_id}`, () => client.detailPetTour(content_id));
    const allowed = parsePetAllowed(item);
    await db.execute(sql`
      UPDATE pois SET pet_allowed = ${allowed}, pet_info = ${JSON.stringify(item ?? { none: true })}::jsonb WHERE content_id = ${content_id}
    `);
    stats.checked++;
    if (allowed === true) stats.allowed++;
    else if (allowed === false) stats.notAllowed++;
    else stats.unknown++;
  }
  await computeRegions();
  await finishRun(runId, "done", { stats });
  console.log("[ingest:pet] 완료", stats, `(대상 ${targets.length}건, 예산 ${budget})`);
} catch (e) {
  const quota = e instanceof QuotaStop || e instanceof TourQuotaError;
  console.warn(`[ingest:pet] ${quota ? "한도로 중단" : "실패"}: ${(e as Error).message}`, stats);
  await computeRegions();
  await finishRun(runId, quota ? "done" : "failed", { stats, error: (e as Error).message });
  if (!quota) process.exitCode = 1;
} finally {
  await closeDb();
}
