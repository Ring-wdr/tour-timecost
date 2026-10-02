/**
 * pnpm ingest:tour — 시군구 목록과 콘텐츠 타입별 전국 목록을 적재한다.
 * 한도에 가까우면 체크포인트를 남기고 중단, 다음 실행에서 이어받는다.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { db, closeDb, schema } from "@/lib/db";
import { finishRun, lastCheckpoint, startRun } from "@/lib/ingest";
import { computeRegions } from "@/lib/regions";
import { createTourClient, TourQuotaError } from "@/lib/tour/client";
import { QuotaStop, tourCall } from "@/lib/tour/quota";
import { parseCoord, regionCodeOf, type AreaItem } from "@/lib/tour/schema";

type Checkpoint = { regionsDone: boolean; typeIndex: number; pageNo: number };

const client = createTourClient();
const resume = await lastCheckpoint<Checkpoint>("tour");
const cp: Checkpoint = resume ?? { regionsDone: false, typeIndex: 0, pageNo: 1 };
const runId = await startRun("tour", client.source);
const stats = { regions: 0, pois: 0, skippedNoRegion: 0, pages: 0 };
console.log(`[ingest:tour] source=${client.source} ${resume ? `체크포인트에서 재개 ${JSON.stringify(cp)}` : "처음부터"}`);

function toRow(it: AreaItem) {
  const c = parseCoord(it.mapx, it.mapy);
  return {
    contentId: it.contentid,
    contentTypeId: Number(it.contenttypeid),
    title: it.title,
    addr: [it.addr1, it.addr2].filter(Boolean).join(" ") || null,
    lon: c?.lon ?? null,
    lat: c?.lat ?? null,
    regionCode: regionCodeOf(it),
    imageUrl: it.firstimage ?? it.firstimage2 ?? null,
    modifiedTime: it.modifiedtime ?? null,
    raw: it,
  };
}

try {
  if (!cp.regionsDone) {
    for (let pageNo = 1; ; pageNo++) {
      const page = await tourCall(client, `ldongCode2 p${pageNo}`, () => client.ldongCodes(pageNo));
      const rows = page.items.map((i) => ({
        code: `${i.lDongRegnCd}${i.lDongSignguCd}`,
        regnCd: i.lDongRegnCd,
        signguCd: i.lDongSignguCd,
        sidoName: i.lDongRegnNm,
        name: i.lDongSignguNm,
      }));
      if (rows.length) {
        await db
          .insert(schema.regions)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.regions.code,
            set: { sidoName: sql`excluded.sido_name`, name: sql`excluded.name` },
          });
      }
      stats.regions += rows.length;
      if (pageNo * 1000 >= page.totalCount || rows.length === 0) break;
    }
    cp.regionsDone = true;
    console.log(`[ingest:tour] 시군구 ${stats.regions}개`);
  }

  const types = config.tour.ingestTypes;
  for (; cp.typeIndex < types.length; cp.typeIndex++, cp.pageNo = 1) {
    const contentTypeId = types[cp.typeIndex]!;
    for (; ; cp.pageNo++) {
      const page = await tourCall(client, `areaBasedList2 type=${contentTypeId} p${cp.pageNo}`, () =>
        client.areaBasedList({ contentTypeId, pageNo: cp.pageNo, numOfRows: config.tour.pageSize }),
      );
      stats.pages++;
      const rows = page.items.map(toRow);
      stats.skippedNoRegion += rows.filter((r) => !r.regionCode).length;
      if (rows.length) {
        await db
          .insert(schema.pois)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.pois.contentId,
            set: {
              contentTypeId: sql`excluded.content_type_id`,
              title: sql`excluded.title`,
              addr: sql`excluded.addr`,
              lon: sql`excluded.lon`,
              lat: sql`excluded.lat`,
              regionCode: sql`excluded.region_code`,
              imageUrl: sql`excluded.image_url`,
              modifiedTime: sql`excluded.modified_time`,
              raw: sql`excluded.raw`,
              syncedAt: sql`now()`,
            },
          });
      }
      stats.pois += rows.length;
      console.log(`[ingest:tour] type=${contentTypeId} p${cp.pageNo}: ${rows.length}건 (전체 ${page.totalCount})`);
      if (cp.pageNo * config.tour.pageSize >= page.totalCount || rows.length === 0) break;
    }
  }

  const r = await computeRegions();
  console.log(`[ingest:tour] 시군구 ${r.total}개 중 후보 ${r.candidates}개, 제외 ${r.excluded}개`);
  await finishRun(runId, "done", { stats: { ...stats, ...r } });
  console.log(`[ingest:tour] 완료`, stats);
} catch (e) {
  if (e instanceof QuotaStop || e instanceof TourQuotaError) {
    console.warn(`[ingest:tour] 한도 근접으로 중단: ${e.message}. 체크포인트 ${JSON.stringify(cp)} — 다음 실행에서 이어받음`);
    await finishRun(runId, "paused", { checkpoint: cp, stats, error: e.message });
  } else {
    console.error("[ingest:tour] 실패", e);
    await finishRun(runId, "paused", { checkpoint: cp, stats, error: String(e) });
    process.exitCode = 1;
  }
} finally {
  await closeDb();
}
