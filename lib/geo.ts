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

/** 제주 등 섬 여부 (자동차 경로 불가 판정용, mock 전용 근사) */
export function isJeju(p: LonLat): boolean {
  return p.lat < 33.7 && p.lon > 126 && p.lon < 127.1;
}
