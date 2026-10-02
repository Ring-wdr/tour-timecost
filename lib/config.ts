/** 설정 기본값. 데이터로 확인되지 않은 값은 모두 "사용자 입력 기본값"이며 UI에 그렇게 표기한다. */
export const config = {
  tour: {
    baseUrl: "https://apis.data.go.kr/B551011/KorService2",
    mobileApp: "WeekendTripCompare",
    dailyLimit: 1000,
    /** 한도의 이 비율을 넘으면 배치 적재를 중단하고 다음 실행에서 이어받는다 */
    stopRatio: 0.9,
    pageSize: 1000, // numOfRows 최대값 미확인 (docs/api-notes.md)
    requestDelayMs: 300,
    maxRetries: 3,
    /** 배치 적재 대상 콘텐츠 타입 (축제 15는 별도 스크립트) */
    ingestTypes: [12, 14, 28, 39, 32] as const,
    festivalWindowDays: 60,
    minAttractionsForCandidate: 3,
  },
  kakao: {
    baseUrl: "https://apis-navi.kakaomobility.com",
    dailyLimits: { directions: 10_000, destinations: 1_000, future: 5_000 },
    guardRatio: 0.8,
    multiBatchSize: 30,
    tollTopN: 20,
    futureTopN: 10,
    ttlDays: { destinations: 7, directions: 30, future: 7 },
  },
  opinet: { dailyLimit: 1_000 },
  search: {
    maxOneWayKm: { daytrip: 250, overnight: 400 },
    resultCacheMinutes: 10,
  },
  defaults: {
    fuelPricePerLiter: 1700, // 유가 데이터 없을 때 기본값 (원/L)
    fuelEfficiencyKmPerL: 12,
    lodgingPerNight: 100_000, // 숙박 가격 데이터 없음 → 사용자 입력 기본값
    dailySpendPerPerson: 40_000, // 식비·입장료 1인 1일
    weights: { time: 0.4, cost: 0.3, poi: 0.3 },
    festivalBonus: 0.1,
  },
} as const;

export type TripType = "daytrip" | "overnight";
