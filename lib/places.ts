import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type Place = {
  content_id: string;
  region_code: string;
  content_type_id: number;
  title: string;
  addr: string | null;
  image_url: string | null;
  pet_allowed: boolean | null;
};

/**
 * 시군구별 대표 장소: 관광지·문화시설 중 이미지 있는 것 우선.
 * TourAPI에는 인기도 지표가 없어 "대표"는 이미지 보유 + contentId 순의 단순 규칙이다.
 */
export async function topPlaces(codes: string[], perRegion = 5): Promise<Map<string, Place[]>> {
  const out = new Map<string, Place[]>();
  if (!codes.length) return out;
  const rows = await db.execute<Place & { rn: number }>(sql`
    SELECT * FROM (
      SELECT content_id, region_code, content_type_id, title, addr, image_url, pet_allowed,
        row_number() OVER (PARTITION BY region_code ORDER BY (image_url IS NULL), content_type_id, content_id) AS rn
      FROM pois WHERE region_code IN ${codes} AND content_type_id IN (12, 14)
    ) t WHERE rn <= ${perRegion} ORDER BY region_code, rn
  `);
  for (const r of rows) out.set(r.region_code, [...(out.get(r.region_code) ?? []), r]);
  return out;
}
