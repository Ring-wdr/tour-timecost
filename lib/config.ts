/** 설정 기본값. 데이터로 확인되지 않은 값은 모두 "사용자 입력 기본값"이며 UI에 그렇게 표기한다. */
export const config = {
  tour: {
    baseUrl: "https://apis.data.go.kr/B551011/KorService2",
    mobileApp: "WeekendTripCompare",
    dailyLimit: 1000,
    /** 한도의 이 비율을 넘으면 배치 적재를 중단하고 다음 실행에서 이어받는다 */
    stopRatio: 0.9,
    pageSize: 1000, // 실측: 1000 정상, 5000 요청도 허용됨 (docs/api-notes.md)
    requestDelayMs: 300,
    maxRetries: 3,
    /** 배치 적재 대상 콘텐츠 타입 (축제 15는 별도 스크립트) */
    ingestTypes: [12, 14, 28, 39, 32] as const,
    festivalWindowDays: 60,
    minAttractionsForCandidate: 3,
  },
  kakao: {
    baseUrl: "https://apis-navi.kakaomobility.com",
    dailyLimits: { directions: 10_000, future: 5_000 },
    guardRatio: 0.8,
    /** 예비 점수 상위 N곳만 자동차 길찾기 단건 (다중 목적지는 반경 10km 제한으로 사용 불가) */
    routeTopN: 40,
    futureTopN: 10,
    ttlDays: { directions: 30, future: 7 },
  },
  opinet: { dailyLimit: 1_000 },
  search: {
    maxOneWayKm: { daytrip: 250, overnight: 400 },
    /** 출발지와 너무 가까운 곳(같은 생활권)은 "여행지" 비교에서 뺀다 */
    minOneWayKm: 20,
    resultCacheMinutes: 10,
  },
  defaults: {
    fuelPricePerLiter: 1700, // 유가 데이터 없을 때 기본값 (원/L)
    fuelEfficiencyKmPerL: 12,
    lodgingPerNight: 100_000, // 숙박 가격 데이터 없음 → 사용자 입력 기본값
    dailySpendPerPerson: 40_000, // 식비·입장료 1인 1일
    weights: { time: 0.4, cost: 0.3, poi: 0.3 },
    festivalBonus: 0.1,
    /** 실측: 축제(15)에 연중 전시·상설 공연도 섞여 있다. 이보다 긴 행사는 "장기 행사"로 표시만 하고 보너스에서 뺀다 */
    festivalMaxDays: 31,
  },
} as const;

export type TripType = "daytrip" | "overnight";
