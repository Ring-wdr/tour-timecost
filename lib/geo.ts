export interface LonLat {
  lon: number;
  lat: number;
}

/** 대원거리 (km) */
export function haversineKm(a: LonLat, b: LonLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 캐시 키용: 소수점 둘째 자리(약 1km) 반올림 */
export function roundCoord(p: LonLat): LonLat {
  return { lon: Math.round(p.lon * 100) / 100, lat: Math.round(p.lat * 100) / 100 };
}

/** 자동차로 육지와 연결되지 않는 큰 섬 (mock 라우터 전용 근사: 제주, 울릉) */
export function islandOf(p: LonLat): "jeju" | "ulleung" | null {
  if (p.lat < 33.7 && p.lon > 126 && p.lon < 127.1) return "jeju";
  if (p.lon > 130.7 && p.lat > 37.3 && p.lat < 37.7) return "ulleung";
  return null;
}
