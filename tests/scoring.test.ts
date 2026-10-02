import { describe, expect, it } from "vitest";
import { minMax, normalizeWeights, poiScores, scoreCandidates, type ScoreInput } from "@/lib/scoring";

const cands: ScoreInput[] = [
  { id: "near", durationS: 3600, totalCost: 100_000, poiCount: 10, hasFestival: false },
  { id: "far", durationS: 3 * 3600, totalCost: 200_000, poiCount: 100, hasFestival: true },
  { id: "mid", durationS: 2 * 3600, totalCost: 150_000, poiCount: 30, hasFestival: false },
];

describe("normalizeWeights", () => {
  it("합이 1이 아니면 비율 유지하며 정규화", () => {
    const w = normalizeWeights({ time: 2, cost: 1, poi: 1 });
    expect(w.time).toBeCloseTo(0.5);
    expect(w.cost).toBeCloseTo(0.25);
    expect(w.time + w.cost + w.poi).toBeCloseTo(1);
  });
  it("모두 0이면 기본값 0.4/0.3/0.3", () => {
    expect(normalizeWeights({ time: 0, cost: 0, poi: 0 })).toEqual({ time: 0.4, cost: 0.3, poi: 0.3 });
  });
  it("음수·NaN·누락은 0", () => {
    const w = normalizeWeights({ time: -1, cost: Number.NaN, poi: 5 });
    expect(w).toEqual({ time: 0, cost: 0, poi: 1 });
  });
});

describe("minMax / poiScores", () => {
  it("뒤집기: 작을수록 1", () => {
    expect(minMax([1, 2, 3], true)).toEqual([1, 0.5, 0]);
  });
  it("모두 같으면 1", () => {
    expect(minMax([5, 5], true)).toEqual([1, 1]);
  });
  it("빈 배열", () => {
    expect(minMax([], false)).toEqual([]);
  });
  it("볼거리는 로그 스케일: 10→100이 0→10보다 덜 벌어진다", () => {
    const [a, b, c] = poiScores([0, 10, 100]);
    expect(a).toBe(0);
    expect(c).toBe(1);
    expect(b!).toBeGreaterThan(0.5); // 선형이면 0.1
  });
  it("볼거리 모두 0이면 모두 0점", () => {
    expect(poiScores([0, 0])).toEqual([0, 0]);
  });
});

describe("scoreCandidates", () => {
  it("시간 가중치만 주면 가까운 곳이 1등", () => {
    const r = scoreCandidates(cands, { time: 1, cost: 0, poi: 0 });
    expect(r[0]!.id).toBe("near");
    expect(r[0]!.score).toBe(1);
    expect(r.at(-1)!.id).toBe("far");
  });
  it("볼거리 가중치만 주면 볼거리 많은 곳이 1등", () => {
    expect(scoreCandidates(cands, { time: 0, cost: 0, poi: 1 })[0]!.id).toBe("far");
  });
  it("기여도의 합 = 점수", () => {
    for (const s of scoreCandidates(cands, { time: 0.4, cost: 0.3, poi: 0.3 }, { festivalBonus: 0.1 })) {
      const sum = s.parts.time + s.parts.cost + s.parts.poi + s.parts.festival;
      expect(s.score).toBeCloseTo(sum, 3);
    }
  });
  it("축제 보너스는 선택 시에만 더한다", () => {
    const without = scoreCandidates(cands, {}, {}).find((s) => s.id === "far")!;
    const withBonus = scoreCandidates(cands, {}, { festivalBonus: 0.1 }).find((s) => s.id === "far")!;
    expect(without.parts.festival).toBe(0);
    expect(withBonus.score - without.score).toBeCloseTo(0.1);
  });
  it("가중치 합이 1이 아니어도 같은 비율이면 같은 결과", () => {
    const a = scoreCandidates(cands, { time: 4, cost: 3, poi: 3 });
    const b = scoreCandidates(cands, { time: 0.4, cost: 0.3, poi: 0.3 });
    expect(a).toEqual(b);
  });
  it("후보 1개면 시간·비용 1점", () => {
    const [only] = scoreCandidates([cands[0]!], {});
    expect(only!.normalized.time).toBe(1);
    expect(only!.normalized.cost).toBe(1);
  });
  it("동점이면 id 순으로 안정 정렬", () => {
    const tie = scoreCandidates(
      [
        { id: "b", durationS: 1, totalCost: 1, poiCount: 1, hasFestival: false },
        { id: "a", durationS: 1, totalCost: 1, poiCount: 1, hasFestival: false },
      ],
      {},
    );
    expect(tie.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("빈 후보", () => {
    expect(scoreCandidates([], {})).toEqual([]);
  });
});
