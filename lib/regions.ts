import { sql } from "drizzle-orm";
import { config } from "@/lib/config";
import { db } from "@/lib/db";

/**
 * 시군구 대표 좌표·후보 여부·볼거리 지표 계산.
 * 대표 좌표 = 관광지(12)·문화시설(14) 좌표의 중앙값. 관광지(12) < 3 이면 후보 제외.
 */
/**
 * 일반구 처리 (실측: ldongCode2가 "수원시"(41110)와 "수원시 장안구"(41111)를 모두 주고, 장소는 구 코드로 온다).
 * 같은 시도에서 이름이 "<상위 시> "로 시작하는 항목을 하위 구로 보고, 장소·축제의 region_code를 상위 시로 바꾼다.
 * 원래 코드는 raw(jsonb)의 lDongRegnCd/lDongSignguCd에 남아 있다.
 */
export async function mergeGeneralGu() {
  await db.execute(sql`
    UPDATE regions c SET parent_code = p.code
    FROM regions p
    WHERE c.regn_cd = p.regn_cd AND c.code <> p.code AND c.name LIKE p.name || ' %' AND c.parent_code IS DISTINCT FROM p.code
  `);
  await db.execute(sql`UPDATE pois SET region_code = r.parent_code FROM regions r WHERE pois.region_code = r.code AND r.parent_code IS NOT NULL`);
  await db.execute(sql`UPDATE festivals SET region_code = r.parent_code FROM regions r WHERE festivals.region_code = r.code AND r.parent_code IS NOT NULL`);
}

export async function computeRegions() {
  const min = config.tour.minAttractionsForCandidate;
  await mergeGeneralGu();
  await db.execute(sql`
    WITH stats AS (
      SELECT region_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY lon) FILTER (WHERE content_type_id IN (12, 14) AND lon IS NOT NULL) AS mlon,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) FILTER (WHERE content_type_id IN (12, 14) AND lat IS NOT NULL) AS mlat,
        count(*) FILTER (WHERE content_type_id = 12 AND lon IS NOT NULL) AS n12,
        avg(CASE WHEN image_url IS NOT NULL THEN 1.0 ELSE 0.0 END) FILTER (WHERE content_type_id IN (12, 14, 28)) AS img,
        count(*) FILTER (WHERE pet_allowed) AS pet
      FROM pois WHERE region_code IS NOT NULL GROUP BY region_code
    ),
    tc AS (
      SELECT region_code, jsonb_object_agg(content_type_id::text, n) AS counts
      FROM (SELECT region_code, content_type_id, count(*) AS n FROM pois WHERE region_code IS NOT NULL GROUP BY 1, 2) t
      GROUP BY region_code
    )
    UPDATE regions r SET
      lon = s.mlon,
      lat = s.mlat,
      type_counts = coalesce(tc.counts, '{}'::jsonb),
      image_ratio = coalesce(s.img, 0),
      pet_count = coalesce(s.pet, 0),
      is_candidate = r2.parent_code IS NULL AND coalesce(s.n12, 0) >= ${min} AND s.mlon IS NOT NULL,
      excluded_reason = CASE WHEN r2.parent_code IS NOT NULL THEN '상위 시(' || r2.parent_code || ')로 합산'
                             WHEN coalesce(s.n12, 0) >= ${min} AND s.mlon IS NOT NULL THEN NULL
                             ELSE '관광지 ' || coalesce(s.n12, 0) || '개 (< ${sql.raw(String(min))})' END,
      computed_at = now()
    FROM regions r2
    LEFT JOIN stats s ON s.region_code = r2.code
    LEFT JOIN tc ON tc.region_code = r2.code
    WHERE r.code = r2.code
  `);
  const rows = await db.execute<{ code: string; name: string; sido_name: string; is_candidate: boolean; excluded_reason: string | null }>(
    sql`SELECT code, name, sido_name, is_candidate, excluded_reason FROM regions ORDER BY code`,
  );
  const excluded = rows.filter((r) => !r.is_candidate);
  const merged = excluded.filter((r) => r.excluded_reason?.startsWith("상위 시"));
  if (merged.length) console.log(`[regions] 일반구 ${merged.length}곳은 상위 시로 합산`);
  for (const r of excluded.filter((r) => !merged.includes(r))) console.log(`[regions] 후보 제외 ${r.code} ${r.sido_name} ${r.name}: ${r.excluded_reason}`);
  return { total: rows.length, candidates: rows.length - excluded.length, excluded: excluded.length };
}
