# API 실측 노트 (Phase 0)

> 최종 갱신 2026-10-02 (KST 10-03).
> - **TourAPI: 실측 완료.** 원본 응답은 키를 지운 채 `fixtures/tour/probe/*.json`에 있고, `tests/tour-probe.test.ts`가 이 녹화본으로 파서를 검증한다.
> - **카카오모빌리티: 공식 문서 확인 + 실측 완료.** 원본 응답은 `fixtures/kakao/probe/*.json`, 파서 검증은 `tests/routing.test.ts`.
> - **오피넷: 키가 없어 미확인.**
>
> 범례: **확인** = 실측, **문서** = 공식 문서, **미확인** = 근거 부족

## 실행 환경 메모

- 클라우드 세션처럼 HTTPS 프록시를 거쳐야 하는 환경에서는 Node 22의 `fetch`가 `HTTPS_PROXY`를 자동으로 쓰지 않는다.
  스크립트와 dev 서버를 **`NODE_USE_ENV_PROXY=1`** 과 함께 실행해야 한다 (예: `NODE_USE_ENV_PROXY=1 pnpm ingest:tour`).
  설정하지 않으면 직접 연결을 시도해 타임아웃이나 프록시 거부가 난다.
- probe 호출도 쿼터를 쓴다. 이번 실측에 TourAPI 22회를 썼다.

## 1. TourAPI 4.0 (KorService2)

| 항목 | 결과 | 상태 |
|---|---|---|
| 응답 래퍼 | `response.header.{resultCode:"0000", resultMsg:"OK"}`, `response.body.{items, numOfRows, pageNo, totalCount}` (모두 숫자 타입) | 확인 |
| 0건 | `"items": ""`, `numOfRows: 0` (pageNo 범위 초과 시) | 확인 |
| 1건 | `numOfRows=1` 요청에서도 **`item`은 길이 1인 배열**. 객체로 오는 경우는 이번에 재현되지 않았지만, 정규화 코드는 객체도 계속 받는다 | 확인 |
| 좌표 | `mapx`(경도), `mapy`(위도) **문자열**, 소수 10~15자리 (예 `"127.4210000000"`) | 확인 |
| 법정동 코드 | `lDongRegnCd` 2자리, `lDongSignguCd` 3자리 **문자열**. 5자리 키 = 이어 붙이기 | 확인 |
| 시도 목록 | `ldongCode2`(옵션 없음) → `{rnum, code, name}` 16개. **`12` = 전남광주통합특별시**(신규)가 있다 | 확인 |
| 시군구 목록 | `ldongCode2?lDongListYn=Y` → `{lDongRegnCd, lDongRegnNm, lDongSignguCd, lDongSignguNm, rnum}` **269개** | 확인 |
| 일반구 | 구가 있는 시는 **상위 시(예: 수원시 41110)와 각 구(41111 장안구 …)가 모두 목록에 나오고, 장소는 구 코드로 온다.** 13개 시·39개 구 | 확인 → 구를 상위 시로 합산 (`lib/regions.ts`의 `mergeGeneralGu`) |
| `lDongSignguCd` 단독 | 오류 없이 **시도 무관하게 시군구 코드만으로 필터**된다 (820 → 310건, 41+820 → 85건). 명세대로 항상 `lDongRegnCd`와 같이 쓴다 | 확인 |
| `areacode`/`sigungucode`/`cat1~3` | 빈 문자열인 항목이 많다. 신규 분류 `lclsSystm1~3`가 있다 | 확인 (미사용) |
| 이미지 | `firstimage`/`firstimage2`, 없으면 `""`. **http와 https가 섞여 온다** → https로 통일 | 확인 |
| 저작권 | `cpyrhtDivCd`: `Type1`, `Type3`, `""` | 확인 |
| `numOfRows` | 1000 정상. 5000 요청도 그대로 받아 전체 2,748건을 한 번에 반환 | 확인 (기본 1000 유지) |
| 콘텐츠 타입 | 12, 14, 15, 28, 32, 38, 39 모두 유효 | 확인 |
| 타입별 전체 건수 (2026-10-02) | 12: 12,603 / 14: 2,748 / 15: 901 / 28: 3,751 / 32: 2,925 / 38: 12,228 / 39: 13,404 / 전체 49,628 | 확인 |
| `searchFestival2` | `eventstartdate`, `eventenddate` (YYYYMMDD 문자열). 10/3~10/4 범위 117건. **연중 전시·상설 공연(예: 1/1~12/31)도 섞여 있다** | 확인 → 31일 넘는 행사는 "장기 행사"로 표시만 하고 축제 보너스에서 제외 |
| `detailIntro2` (12) | `usetime`, `restdate`, `parking`, `chkpet`, `expagerange` 등 | 확인 (미사용) |
| `detailPetTour2` | 정보가 없으면 `items: ""`. 있으면 `acmpyTypeCd`("전구역 동반가능"/"일부구역 동반가능"…), `acmpyPsblCpam`, `acmpyNeedMtr`, `etcAcmpyInfo`, `rela*` | 확인. 관광지 표본 40곳 중 5곳(12.5%)만 정보 있음 |
| `areaBasedSyncList2` | `showflag` 필드 추가, 전체 69,073건 | 확인 (미사용) |
| 한도 초과 응답 | 재현하지 않음 (쿼터 소진 위험). 키 누락 시 **XML이 아닌 JSON** `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE_KEY_IS_NULL","returnReasonCode":"20"}}}` 이 왔다 | 일부 확인. 파서는 본문에 `LIMITED_NUMBER_OF_SERVICE_REQUESTS`가 있으면 JSON/XML 상관없이 `TourQuotaError` |

### 실제 적재 결과 (2026-10-02)

| 항목 | 값 |
|---|---|
| `pnpm ingest:tour` 호출 수 | **38회** (시군구 1 + 타입 5개 37페이지) |
| 적재 장소 | 35,431건 (좌표 없음 36, 법정동 코드 없음 4) |
| 시군구 | 269개 → 일반구 39개를 상위 시로 합산 → **후보 230개** (관광지 3개 미만으로 빠진 곳 없음) |
| `pnpm ingest:festivals` | 1회, 60일 범위 286건 |

## 2. 카카오모빌리티 길찾기 (공식 문서 확인 + 실측)

출처: developers.kakaomobility.com/guide/navi-api (directions / destinations / origins / future / reference)

| 항목 | 내용 | 상태 |
|---|---|---|
| 인증 | `Authorization: KakaoAK ${REST_API_KEY}` | 문서 |
| 자동차 길찾기 | `GET /v1/directions?origin=x,y&destination=x,y&summary=true` → `routes[0].{result_code, result_msg, summary.{distance(m), duration(s), fare.{taxi, toll}}}` | 문서 |
| 다중 목적지 | `POST /v1/destinations/directions`, 바디 `{origin:{x,y}, destinations:[{x,y,key}] ≤30, radius(필수, **최대 10000m**), priority}` → `routes[].{key, result_code, summary.{distance,duration}}` | 문서 |
| 다중 출발지 | `POST /v1/origins/directions`, 역시 **radius 최대 10000m** | 문서 |
| 미래 운행 정보 | `GET /v1/future/directions?origin=x,y&destination=x,y&departure_time=YYYYMMDDHHMM`(현재 이후 시각만) → 응답 형식은 자동차 길찾기와 같음 (`fare.toll` 포함) | 문서 |
| 결과 코드 | 0 성공, 1 경로 없음, 102/103 출발/도착 주변 도로 없음, 104 출발=도착(5m 이내), 105/106 유고, 2xx 다중 출발지, 3xx 다중 목적지 | 문서 |
| 일일 무료량 | 길찾기 10,000 / 다중 목적지 1,000 / 미래 5,000 | 프롬프트 |
| 자동차 길찾기 응답 | 서울시청→가평: `result_code 0`, `summary.{distance 76189, duration 4525, fare.{taxi 96100, toll 1500}}`, `summary=true`여도 `sections[].{distance,duration}`은 옴 | **확인** |
| 미래 운행 응답 | 같은 형식. 토 09:00 출발 서울→가평 8,782초(평시 대비 약 1.9배) | **확인** |
| 다중 목적지 반경 밖 | `radius=10000`으로 45km·240km 목적지 요청 → 각 경로 `result_code 304` "목적지가 설정한 길 찾기 반경 범위를 벗어남" (HTTP 200) | **확인** — 사용 불가 재확인 |
| 출발=도착 | `result_code 104` (HTTP 200) | **확인** |
| 도착지 주변 도로 없음 | 시군구 대표 좌표(장소 좌표 중앙값)가 산·논 한가운데면 `result_code 103` (부산 출발 40곳 중 3곳) | **확인** → 길찾기 목적지는 대표 좌표에서 가장 가까운 음식점·숙박·문화시설 좌표(`regions.route_lon/lat`)로 바꾸고, 103 등은 "갈 수 없음"이 아니라 추정 유지. 경로 없음 판정은 `result_code 1`만 |
| 응답 시간 | 단건 약 0.9초 → 40+10건을 동시 8개로 호출해 첫 조회 약 6초 (순차 46초) | **확인** |

### ⚠ 명세 3-2·4장과 다른 점: 다중 목적지를 쓸 수 없다

명세는 "후보를 30개씩 묶어 다중 목적지로 거리·시간"을 구하도록 했지만, **다중 목적지(와 다중 출발지)의 `radius`가 최대 10km**라서
출발지에서 20~400km 떨어진 시군구를 비교하는 이 서비스에는 쓸 수 없다. 그래서 절차를 이렇게 바꿨다 (`lib/compare.ts`):

1. 모든 후보: 직선거리 기반 추정 (도로 계수 1.3, 평균 속도) — "직선거리 추정"
2. 예비 점수 상위 **40곳**: 자동차 길찾기 단건으로 실제 거리·시간·통행료 (캐시 30일)
3. 나머지: 2단계 실측 표본으로 보정 — 거리는 **실측/추정 비율 중앙값**, 시간은 **직선 km에 대한 1차 회귀** — "보정 추정", 통행료 미계산
   (서울·부산 출발 실측 40곳 LOO 검증: 시간 오차 중앙값 비율 방식 6~24% → 회귀 7~10%, 90분위 27~43% → 16~27%. 거리 오차 중앙 5~7%)
4. 상위 10곳: 미래 운행 정보 (선택 날짜 09:00)

쿼터: 출발지 1km 셀당 최대 길찾기 40 + 미래 10회. 80% 가드 기준으로 새 출발지 셀 하루 약 200곳(길찾기 8,000 ÷ 40)까지 감당한다.

## 3. 오피넷

| 항목 | 현재 가정 | 상태 |
|---|---|---|
| 전국 평균가 | `GET https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=KEY` → `RESULT.OIL[].{PRODCD, PRICE}`, 휘발유 `B027` | 미확인 (키 없음) |

## 4. TAGO (Phase 6)

진행하지 않음 (선택 단계, 키 없음).
