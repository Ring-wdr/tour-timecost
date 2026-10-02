import { describe, expect, it } from "vitest";
import { estimateCost, type CostInput } from "@/lib/cost";

const base: CostInput = {
  oneWayKm: 120,
  tollOneWay: 5000,
  tripType: "daytrip",
  people: 2,
  budget: 200_000,
  fuelPricePerLiter: 1700,
  fuelEfficiencyKmPerL: 12,
  lodgingPerNight: 100_000,
  dailySpendPerPerson: 40_000,
};

describe("estimateCost", () => {
  it("당일치기 기본 계산: 연료 + 왕복 통행료 + 식비", () => {
    const c = estimateCost(base);
    expect(c.fuel).toBe(34_000); // 240km × 1700 / 12
    expect(c.toll).toBe(10_000);
    expect(c.lodging).toBe(0);
    expect(c.food).toBe(80_000);
    expect(c.total).toBe(124_000);
    expect(c.overBudget).toBe(false);
    expect(c.days).toBe(1);
  });

  it("1박이면 숙박 1박 + 식비 2일", () => {
    const c = estimateCost({ ...base, tripType: "overnight" });
    expect(c.nights).toBe(1);
    expect(c.lodging).toBe(100_000);
    expect(c.food).toBe(160_000);
    expect(c.total).toBe(34_000 + 10_000 + 100_000 + 160_000);
  });

  it("연비 0이면 기본값으로 방어하고 메모를 남긴다", () => {
    const c = estimateCost({ ...base, fuelEfficiencyKmPerL: 0 });
    expect(Number.isFinite(c.fuel)).toBe(true);
    expect(c.fuel).toBe(34_000);
    expect(c.notes.join()).toMatch(/연비/);
  });

  it("연비 음수·NaN도 방어", () => {
    expect(estimateCost({ ...base, fuelEfficiencyKmPerL: -3 }).fuel).toBe(34_000);
    expect(estimateCost({ ...base, fuelEfficiencyKmPerL: Number.NaN }).fuel).toBe(34_000);
  });

  it("통행료 미계산이면 toll=null, 합계는 하한값", () => {
    const c = estimateCost({ ...base, tollOneWay: null });
    expect(c.toll).toBeNull();
    expect(c.totalIsLowerBound).toBe(true);
    expect(c.total).toBe(114_000);
    expect(c.notes).toContain("통행료 미계산");
  });

  it("통행료 0원은 계산된 값(미계산 아님)", () => {
    const c = estimateCost({ ...base, tollOneWay: 0 });
    expect(c.toll).toBe(0);
    expect(c.totalIsLowerBound).toBe(false);
  });

  it("예산 경계: 총비용 = 예산이면 예산 안", () => {
    expect(estimateCost({ ...base, budget: 124_000 }).overBudget).toBe(false);
  });

  it("예산 경계: 1원 넘으면 예산 초과", () => {
    expect(estimateCost({ ...base, budget: 123_999 }).overBudget).toBe(true);
  });

  it("인원 0 이하·소수는 최소 1명, 내림", () => {
    expect(estimateCost({ ...base, people: 0 }).food).toBe(40_000);
    expect(estimateCost({ ...base, people: 2.7 }).food).toBe(80_000);
  });

  it("음수 거리·유가는 0으로 처리", () => {
    const c = estimateCost({ ...base, oneWayKm: -10, fuelPricePerLiter: -1 });
    expect(c.fuel).toBe(0);
  });

  it("예산 0이면 비용이 있는 한 초과", () => {
    expect(estimateCost({ ...base, budget: 0 }).overBudget).toBe(true);
  });
});
