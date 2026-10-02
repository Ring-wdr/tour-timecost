import { config, type TripType } from "@/lib/config";

/** 비용은 모두 "추정"이다. 숙박비·식비는 데이터가 아니라 사용자 입력(또는 설정 기본값). */
export interface CostInput {
  /** 편도 도로 거리 km */
  oneWayKm: number;
  /** 편도 통행료 원. null = 미계산 */
  tollOneWay: number | null;
  tripType: TripType;
  people: number;
  budget: number;
  fuelPricePerLiter: number;
  fuelEfficiencyKmPerL: number;
  lodgingPerNight: number;
  dailySpendPerPerson: number;
}

export interface CostBreakdown {
  fuel: number;
  /** 왕복 통행료. null = 미계산 */
  toll: number | null;
  lodging: number;
  food: number;
  /** 미계산 항목은 0으로 더한 합 */
  total: number;
  overBudget: boolean;
  /** 통행료 미계산이면 실제 총비용은 이보다 클 수 있다 */
  totalIsLowerBound: boolean;
  days: number;
  nights: number;
  notes: string[];
}

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function tripDays(tripType: TripType) {
  return tripType === "overnight" ? { days: 2, nights: 1 } : { days: 1, nights: 0 };
}

export function estimateCost(input: CostInput): CostBreakdown {
  const notes: string[] = [];
  const { days, nights } = tripDays(input.tripType);

  let efficiency = input.fuelEfficiencyKmPerL;
  if (!Number.isFinite(efficiency) || efficiency <= 0) {
    efficiency = config.defaults.fuelEfficiencyKmPerL;
    notes.push(`연비 입력값이 올바르지 않아 기본값 ${efficiency}km/L 사용`);
  }
  const people = Math.max(1, Math.floor(nonNeg(input.people)) || 1);

  const roundTripKm = nonNeg(input.oneWayKm) * 2;
  const fuel = Math.round((roundTripKm * nonNeg(input.fuelPricePerLiter)) / efficiency);
  const toll = input.tollOneWay === null ? null : Math.round(nonNeg(input.tollOneWay) * 2);
  if (toll === null) notes.push("통행료 미계산");
  const lodging = Math.round(nonNeg(input.lodgingPerNight) * nights);
  const food = Math.round(nonNeg(input.dailySpendPerPerson) * people * days);
  const total = fuel + (toll ?? 0) + lodging + food;

  return {
    fuel,
    toll,
    lodging,
    food,
    total,
    overBudget: total > nonNeg(input.budget),
    totalIsLowerBound: toll === null,
    days,
    nights,
    notes,
  };
}
