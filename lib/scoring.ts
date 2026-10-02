/** 점수 계산 (순수 함수). 브라우저에서도 그대로 써서 가중치 슬라이더로 즉시 재정렬한다. */

export interface Weights {
  time: number;
  cost: number;
  poi: number;
}

export interface ScoreInput {
  id: string;
  durationS: number;
  totalCost: number;
  /** 사용자 선호 콘텐츠 타입 개수 합 */
  poiCount: number;
  hasFestival: boolean;
}

export interface Scored {
  id: string;
  score: number;
  /** 0~1 정규화 값 */
  normalized: { time: number; cost: number; poi: number };
  /** 최종 점수에 대한 기여도 (가중치 × 정규화 값, 축제 보너스) */
  parts: { time: number; cost: number; poi: number; festival: number };
}

export const DEFAULT_WEIGHTS: Weights = { time: 0.4, cost: 0.3, poi: 0.3 };

/** 음수·NaN은 0, 합이 0이면 기본값, 그 외 합이 1이 되도록 나눈다 */
export function normalizeWeights(w: Partial<Weights>): Weights {
  const clean = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const t = clean(w.time);
  const c = clean(w.cost);
  const p = clean(w.poi);
  const sum = t + c + p;
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  return { time: t / sum, cost: c / sum, poi: p / sum };
}

/** min-max 0~1. invert면 작을수록 1. 모두 같으면 1 */
export function minMax(values: number[], invert: boolean): number[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 1);
  return values.map((v) => {
    const x = (v - min) / (max - min);
    return invert ? 1 - x : x;
  });
}

export function poiScores(counts: number[]): number[] {
  const logs = counts.map((c) => Math.log1p(Math.max(0, c)));
  if (logs.every((l) => l === 0)) return logs.map(() => 0);
  return minMax(logs, false);
}

export interface ScoreOptions {
  /** 축제 선호 선택 시 보너스 (기본 0.1) */
  festivalBonus?: number;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function scoreCandidates(items: ScoreInput[], weights: Partial<Weights>, opts: ScoreOptions = {}): Scored[] {
  const w = normalizeWeights(weights);
  const bonus = opts.festivalBonus ?? 0;
  const time = minMax(items.map((i) => i.durationS), true);
  const cost = minMax(items.map((i) => i.totalCost), true);
  const poi = poiScores(items.map((i) => i.poiCount));

  return items
    .map((it, k) => {
      const parts = {
        time: round4(w.time * time[k]!),
        cost: round4(w.cost * cost[k]!),
        poi: round4(w.poi * poi[k]!),
        festival: it.hasFestival ? bonus : 0,
      };
      return {
        id: it.id,
        score: round4(parts.time + parts.cost + parts.poi + parts.festival),
        normalized: { time: round4(time[k]!), cost: round4(cost[k]!), poi: round4(poi[k]!) },
        parts,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
