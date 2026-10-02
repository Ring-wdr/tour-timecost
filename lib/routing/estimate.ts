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

/** 최소제곱 직선 y = a + b·x. 표본이 2개 미만이거나 x 분산이 0이면 null */
export function fitLine(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * 실측 표본(직선 km → 실제 거리·시간)으로 추정 모델을 보정한다.
 * - 거리: 실측/추정 비율의 중앙값 (실측 표본 LOO 오차 중앙 5~7%)
 * - 시간: 직선 km에 대한 1차 회귀 (도심 출발에서 비율 방식 24% → 10%, 2026-10 서울·부산 실측)
 * 표본 5개 미만이거나 기울기가 0 이하이면 시간도 비율 방식으로 대체한다.
 */
export function calibrator(samples: { straightKm: number; distanceKm: number; durationS: number }[]) {
  if (samples.length < 3) return null;
  const kd = median(samples.map((s) => s.distanceKm / estimateRoute(s.straightKm).distanceKm))!;
  const kt = median(samples.map((s) => s.durationS / estimateRoute(s.straightKm).durationS))!;
  const line = samples.length >= 5 ? fitLine(samples.map((s) => s.straightKm), samples.map((s) => s.durationS)) : null;
  const useLine = line !== null && line.b > 0;
  return (straightKm: number) => {
    const est = estimateRoute(straightKm);
    const byRatio = est.durationS * kt;
    // 회귀 외삽이 비현실적으로 작아지지 않도록 비율 방식의 절반을 하한으로
    const durationS = useLine ? Math.max(line.a + line.b * straightKm, byRatio * 0.5) : byRatio;
    return { distanceKm: est.distanceKm * kd, durationS: Math.round(durationS) };
  };
}
