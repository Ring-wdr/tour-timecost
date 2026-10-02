import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { DataNotice } from "@/components/DataNotice";
import { TYPE_LABEL } from "@/lib/compare-input";
import { db } from "@/lib/db";
import { ymd } from "@/lib/format";
import { topPlaces } from "@/lib/places";
import { kstDay } from "@/lib/usage";

export const dynamic = "force-dynamic";

type Region = {
  code: string;
  name: string;
  sido_name: string;
  lon: number | null;
  lat: number | null;
  is_candidate: boolean;
  excluded_reason: string | null;
  type_counts: Record<string, number>;
  image_ratio: number;
  pet_count: number;
  synced_at: string | null;
};

export default async function RegionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{4,6}$/.test(code)) notFound();
  const [region] = await db.execute<Region>(sql`
    SELECT r.*, (SELECT max(synced_at)::text FROM pois WHERE region_code = r.code) AS synced_at FROM regions r WHERE code = ${code}
  `);
  if (!region) notFound();
  const today = kstDay();
  const [places, festivals] = await Promise.all([
    topPlaces([code], 10),
    db.execute<{ content_id: string; title: string; start_date: string; end_date: string; addr: string | null }>(sql`
      SELECT content_id, title, start_date::text, end_date::text, addr FROM festivals
      WHERE region_code = ${code} AND end_date >= ${today} ORDER BY start_date LIMIT 20
    `),
  ]);
  const list = places.get(code) ?? [];

  return (
    <>
      <DataNotice />
      <p className="small"><Link href="/">← 새로 검색</Link></p>
      <h1>{region.sido_name} {region.name}</h1>
      <p className="muted small">
        법정동 코드 {region.code}
        {region.lat !== null && region.lon !== null && <> · 대표 좌표 {region.lat.toFixed(4)}, {region.lon.toFixed(4)} (관광지·문화시설 좌표 중앙값)</>}
        {!region.is_candidate && <> · <span className="badge warn">비교 후보 아님: {region.excluded_reason}</span></>}
      </p>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>볼거리 지표</h2>
        <ul>
          {["12", "14", "28", "39", "38"].map((t) => (
            <li key={t}>{TYPE_LABEL[t]} {region.type_counts[t] ?? 0}곳</li>
          ))}
          <li>
            숙박시설 <b>{region.type_counts["32"] ?? 0}곳</b> <span className="muted small">(참고 지표 — TourAPI에는 숙박 가격 정보가 없습니다)</span>
          </li>
          <li>대표 이미지 보유 비율 {Math.round(region.image_ratio * 100)}%</li>
          <li>반려동물 동반 가능(수집된 장소 기준) {region.pet_count}곳</li>
        </ul>
      </section>

      <h2>대표 장소</h2>
      {list.length ? (
        <ul>
          {list.map((p) => (
            <li key={p.content_id}>
              <b>{p.title}</b> <span className="small muted">{TYPE_LABEL[String(p.content_type_id)]}{p.addr && ` · ${p.addr}`}</span>
              {p.pet_allowed === true && <> <span className="badge">반려동물 동반</span></>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">적재된 장소가 없습니다.</p>
      )}

      <h2>진행 중·예정 축제 (60일)</h2>
      {festivals.length ? (
        <ul>
          {festivals.map((f) => (
            <li key={f.content_id}>{f.title} <span className="small muted">{ymd(f.start_date)} ~ {ymd(f.end_date)}</span></li>
          ))}
        </ul>
      ) : (
        <p className="muted">예정된 축제가 없습니다.</p>
      )}

      <p className="small muted">
        출처: 한국관광공사 TourAPI 4.0 (국문 관광정보 서비스_GW), 공공누리. 마지막 동기화 {region.synced_at?.slice(0, 16) ?? "-"}.
      </p>
    </>
  );
}
