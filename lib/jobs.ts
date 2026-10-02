import { sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { finishRun, startRun } from "@/lib/ingest";
import { createTourClient } from "@/lib/tour/client";
import { tourCall } from "@/lib/tour/quota";
import { isoToYmd, parseCoord, regionCodeOf, ymdToIso } from "@/lib/tour/schema";
import { kstDay } from "@/lib/usage";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** 오늘(KST)부터 60일 범위 축제 upsert */
export async function refreshFestivals() {
  const client = createTourClient();
  const runId = await startRun("festivals", client.source);
  const from = kstDay();
  const to = addDays(from, config.tour.festivalWindowDays);
  let count = 0;
  try {
    for (let pageNo = 1; ; pageNo++) {
      const page = await tourCall(client, `searchFestival2 p${pageNo}`, () =>
        client.searchFestival({ eventStartDate: isoToYmd(from), eventEndDate: isoToYmd(to), pageNo, numOfRows: config.tour.pageSize }),
      );
      const rows = page.items.map((f) => {
        const c = parseCoord(f.mapx, f.mapy);
        return {
          contentId: f.contentid,
          title: f.title,
          startDate: ymdToIso(f.eventstartdate),
          endDate: ymdToIso(f.eventenddate),
          lon: c?.lon ?? null,
          lat: c?.lat ?? null,
          regionCode: regionCodeOf(f),
          addr: f.addr1 ?? null,
          imageUrl: f.firstimage ?? null,
          raw: f,
        };
      });
      if (rows.length) {
        await db
          .insert(schema.festivals)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.festivals.contentId,
            set: {
              title: sql`excluded.title`,
              startDate: sql`excluded.start_date`,
              endDate: sql`excluded.end_date`,
              lon: sql`excluded.lon`,
              lat: sql`excluded.lat`,
              regionCode: sql`excluded.region_code`,
              addr: sql`excluded.addr`,
              imageUrl: sql`excluded.image_url`,
              raw: sql`excluded.raw`,
              syncedAt: sql`now()`,
            },
          });
      }
      count += rows.length;
      if (pageNo * config.tour.pageSize >= page.totalCount || rows.length === 0) break;
    }
    // 이미 끝난 축제 정리
    await db.execute(sql`DELETE FROM festivals WHERE end_date < ${from}`);
    const stats = { from, to, upserted: count, source: client.source };
    await finishRun(runId, "done", { stats });
    return stats;
  } catch (e) {
    await finishRun(runId, "failed", { error: (e as Error).message });
    throw e;
  }
}

const opinetSchema = z.object({
  RESULT: z.object({ OIL: z.array(z.object({ PRODCD: z.string(), PRICE: z.coerce.number() }).passthrough()) }),
});

/** 오피넷 전국 평균 휘발유 가격. 키가 없으면 건너뛴다. */
export async function refreshFuel() {
  if (!env.OPINET_KEY) return { skipped: "OPINET_KEY 없음 → 설정 기본 유가 사용" };
  const runId = await startRun("fuel", "live");
  try {
    const res = await fetch(`https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${encodeURIComponent(env.OPINET_KEY)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const data = opinetSchema.parse(await res.json());
    const day = kstDay();
    const rows = data.RESULT.OIL.map((o) => ({ day, area: "ALL", product: o.PRODCD, price: o.PRICE, source: "opinet" }));
    for (const r of rows) {
      await db
        .insert(schema.fuelPrices)
        .values(r)
        .onConflictDoUpdate({ target: [schema.fuelPrices.day, schema.fuelPrices.area, schema.fuelPrices.product], set: { price: r.price } });
    }
    await finishRun(runId, "done", { stats: { rows: rows.length } });
    return { rows: rows.length };
  } catch (e) {
    await finishRun(runId, "failed", { error: (e as Error).message });
    throw e;
  }
}

/** 최신 휘발유(B027) 전국 평균. 없으면 null */
export async function latestGasolinePrice(): Promise<{ price: number; day: string } | null> {
  const rows = await db.execute<{ price: number; day: string }>(
    sql`SELECT price, day::text FROM fuel_prices WHERE area = 'ALL' AND product = 'B027' ORDER BY day DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** 만료 후 30일 지난 캐시만 삭제 (그 전까지는 외부 장애 시 "최신 아님" 응답에 쓴다) */
export async function purgeExpiredCache() {
  const rows = await db.execute(sql`DELETE FROM api_cache WHERE expires_at < now() - interval '30 days' RETURNING key`);
  return { deleted: rows.length };
}
