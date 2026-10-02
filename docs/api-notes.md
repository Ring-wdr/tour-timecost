# API 실측 노트 (Phase 0)

> 작성일 2026-10-02. **이 문서의 값은 아직 실측되지 않았다.**
> 개발 환경(클라우드 세션)의 네트워크 정책이 아래 호스트를 모두 차단해서 실측 요청이 프록시에서 403
> (`Host not in allowlist`)으로 끝났다.
>
> | 호스트 | 용도 | 상태 |
> |---|---|---|
> | `apis.data.go.kr` | TourAPI, TAGO | 차단 (키는 있음) |
> | `apis-navi.kakaomobility.com` | 카카오 길찾기 | 차단 + 키 없음 |
> | `developers.kakaomobility.com` | 카카오 공식 문서 | 차단 (문서 확인 불가) |
> | `www.opinet.co.kr` | 유가 | 차단 + 키 없음 |
>
> 그래서 모든 기능은 **mock 클라이언트 + 합성 픽스처**(`fixtures/tour/*.synthetic.json`)로 개발했다.
> 허용된 네트워크에서 `pnpm probe:tour` / `pnpm probe:kakao` / `pnpm probe:opinet`을 돌리면
> 원본 응답이 키를 지운 상태로 `fixtures/<api>/probe/*.json`에 저장된다. 그 결과로 아래 "미확인" 칸을 채운다.

범례: **확인** = 실측으로 확인, **문서** = 프롬프트/공개 문서 기준(실측 전), **미확인** = 근거 부족

## 1. TourAPI 4.0 (KorService2)

| 항목 | 현재 가정 | 상태 | 코드 위치 |
|---|---|---|---|
| Base URL | `https://apis.data.go.kr/B551011/KorService2` | 문서 | `lib/config.ts` |
| 키 | Decoding 키를 `encodeURIComponent`해서 `serviceKey`로 전달 | 문서 | `lib/tour/client.ts` |
| 응답 래퍼 | `response.header.resultCode`(정상 `"0000"`), `response.body.{items,numOfRows,pageNo,totalCount}` | 문서 | `lib/tour/schema.ts` |
| 0건 | `items: ""` | 미확인 (보고된 형태) → 스키마가 `""`/`null`/`{}` 모두 허용 | `normalizeItems` |
| 1건 | `items.item`이 배열이 아닌 객체 | 미확인 (보고된 형태) → 객체/배열 모두 허용 | `normalizeItems` |
| 좌표 | `mapx`=경도, `mapy`=위도, 문자열 | 문서 → 문자열/숫자 모두 허용, 한국 범위 밖이나 0은 버림 | `parseCoord` |
| 법정동 코드 | `lDongRegnCd` 2자리(시도), `lDongSignguCd` 3자리(시군구). 시군구 고유키 = 둘을 이어 붙인 5자리 | 미확인 (자릿수/선행 0 유지 여부) → 문자열로 저장 | `regionCodeOf` |
| `ldongCode2` | `lDongListYn=Y`면 시도·시군구 전체 목록(`lDongRegnCd, lDongRegnNm, lDongSignguCd, lDongSignguNm`) | 미확인 | `LiveTourClient.ldongCodes` |
| `lDongSignguCd` 단독 사용 | 불가 (`lDongRegnCd` 필요) | 문서 | probe `areaBasedList2-signgu-without-regn` |
| 콘텐츠 타입 | 12 관광지, 14 문화시설, 15 축제공연행사, 28 레포츠, 32 숙박, 38 쇼핑, 39 음식점 | 문서 (관례값) | `lib/config.ts` |
| `numOfRows` 최대 | 1000으로 가정 | 미확인 | `config.tour.pageSize` |
| 축제 날짜 필드 | `eventstartdate`, `eventenddate` (YYYYMMDD) | 미확인 | `festivalItem` |
| 반려동물 | `detailPetTour2`의 `acmpyTypeCd`(동반 구분 텍스트), `acmpyPsblCpam`, `acmpyNeedMtr` | 미확인. "불가" 포함이면 false, "가능/동반" 포함이면 true, 그 외 null | `parsePetAllowed` |
| 한도 초과 응답 | JSON이 아닌 XML `OpenAPI_ServiceResponse` + `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`(코드 22) | 미확인 (data.go.kr 게이트웨이 공통 형식으로 알려짐) | `parseTourResponse` → `TourQuotaError` |
| 키 오류 | XML `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(코드 30) | 미확인 | `TourApiError` |
| `areaBasedSyncList2` | 변경분 동기화 | 미확인. 이번 프로토타입은 전체 재적재(upsert)만 구현 | - |

## 2. 카카오모빌리티 길찾기

키가 없고 문서 사이트도 차단돼 **엔드포인트 세부는 전부 미확인**이다. `lib/routing/kakao.ts`의 Live 클라이언트는
아래 가정으로 작성했고, 실제 응답은 zod로 검증해서 형태가 다르면 명확한 오류를 낸다.

| 항목 | 현재 가정 | 상태 |
|---|---|---|
| 인증 | `Authorization: KakaoAK ${KAKAO_REST_KEY}` | 문서 |
| 자동차 길찾기 | `GET /v1/directions?origin=x,y&destination=x,y&summary=true` → `routes[0].result_code`, `routes[0].summary.{distance(m),duration(s),fare.{toll,taxi}}` | 문서 |
| 다중 목적지 | `POST /v1/destinations/directions`, 바디 `{origin:{x,y}, destinations:[{x,y,key}] (≤30), radius(m), priority}` → `routes[].{key,result_code,summary.{distance,duration}}` | **미확인** (기억 기반). 특히 `radius` 상한이 있다면 400km 후보를 못 덮을 수 있음 → 실측 필수 |
| 미래 운행 정보 | `GET /v1/future/directions?...&departure_time=YYYYMMDDHHmm` | **미확인** |
| 실패 코드 | `result_code != 0` 이면 실패 (예: 출발지=도착지, 길 없음) | 문서 (코드값 목록은 미확인) |
| 좌표 순서 | `x=경도, y=위도` | 문서 |
| 일일 무료량 | 길찾기 10,000 / 다중 목적지 1,000 / 미래 5,000 | 문서 |

## 3. 오피넷

| 항목 | 현재 가정 | 상태 |
|---|---|---|
| 전국 평균가 | `GET https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=KEY` → `RESULT.OIL[].{PRODCD, PRICE}`, 휘발유 `B027` | 미확인 |

## 4. TAGO (Phase 6)

진행하지 않음. 키 없음 + 호스트 차단. 요금 필드 유무 미확인.

## 5. 3장 명세와 다른 점 / 결정 사항

1. **실측 불가.** 모든 값이 "문서" 또는 "미확인" 상태다. 프롬프트대로 미확인 값은 확정하지 않고, 스키마를 관대하게(문자열/숫자, 객체/배열, `""`) 받는 쪽으로 구현했다.
2. **합성 픽스처.** 51개 시군구(법정동 코드·이름·중심좌표는 근사값)와 POI 약 2,200건, 축제, 반려동물 정보를 결정적 난수로 만들었다. 모든 파일 이름에 `.synthetic.`, 장소 이름에 `[합성]`, contentid는 9,000,000 이상. 이미지 URL은 로컬 자리표시 SVG.
3. **`TOUR_MOCK=1`** 환경변수를 추가했다. 키는 있지만 네트워크가 막힌 지금 환경처럼, 키가 있어도 픽스처로 돌릴 때 쓴다.
4. **카카오 mock 라우터.** 직선거리 × 도로 계수 1.3, 평균 속도 기반 소요시간, 통행료는 "mock" 출처로 표시(실값 아님). 응답의 `routingSource: "mock"`과 UI 배지로 드러난다.
5. **반려동물.** `detailPetTour2`는 장소당 1회 호출이라 전국 수집이 1,000건/일 한도로 불가능하다. 후보 시군구의 관광지·음식점·숙박부터 일일 예산(기본 300건) 안에서 나눠 수집하는 `pnpm ingest:pet`로 처리하고, 미수집은 `null`로 둔다.
