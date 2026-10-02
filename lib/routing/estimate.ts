/**
 * 직선거리 기반 도로 거리·시간 추정. 실제 경로가 아니다.
 * 도로 계수 1.3, 평균 속도(근거리 40km/h, 60km 초과 75km/h) + 출발·도착 10분.
 * compare.ts는 이 추정치를 카카오 실측 결과의 중앙값 비율로 보정해서 쓴다.
 */
export function estimateRoute(straightKm: number): { distanceKm: number; durationS: number } {
  const km = Math.max(0, straightKm) * 1.3;
  const speed = km > 60 ? 75 : 40;
  return { distanceKm: km, durationS: Math.round((km / speed) * 3600 + 600) };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
