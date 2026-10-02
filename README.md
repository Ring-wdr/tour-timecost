# 주말 어디 갈까 — 예산·이동시간 기반 주말 여행지 비교 (프로토타입)

"이번 주말, 우리 집에서 출발해서 예산 안에 다녀올 수 있는 곳 중 어디가 제일 나은가?"에 답하는 비교 도구입니다.
출발지·날짜(당일/1박)·인원·예산·연비·선호를 넣으면 전국 시군구를 **예상 이동시간, 예상 총비용, 볼거리 점수**로
순위를 매기고, 가중치 슬라이더로 즉시 재정렬하고, 2~4곳을 나란히 비교합니다.
일정 생성·숙소 예약·결제는 범위 밖입니다.

> **현재 상태:** TourAPI는 실측했고 실제 데이터로 적재했습니다(시군구 후보 230곳, 장소 35,431건, 축제 286건).
> 카카오 REST 키가 아직 없어서 **이동시간·거리·통행료는 mock 경로**이며, 화면 상단에 "부분 시연 모드"로 표시됩니다.
> 실측 결과와 명세와 다른 점은 [`docs/api-notes.md`](docs/api-notes.md)에 정리했습니다.
> 키 없이 돌리면 합성(synthetic) 픽스처로 동작합니다.

## 빠른 시작

```bash
pnpm install
cp .env.example .env            # 키는 비워 두면 mock으로 동작
docker compose up -d            # PostGIS 16-3.4
pnpm db:migrate
pnpm ingest:tour                # 시군구·장소 적재 + 대표좌표/후보 계산 (키 없으면 합성 픽스처)
pnpm ingest:festivals           # 오늘부터 60일 축제
pnpm ingest:pet                 # (선택) 반려동물 동반 정보, 실행당 PET_BUDGET건
pnpm dev                        # http://localhost:3000
```

확인용 명령:

```bash
pnpm lint && pnpm typecheck && pnpm test   # 단위 + DB 통합 테스트 (DB가 없거나 비어 있으면 통합 테스트는 skip)
pnpm tsx scripts/dev/compare-twice.ts      # 같은 출발지 재조회 시 외부 호출 0회(캐시 HIT) 로그 확인
curl localhost:3000/api/health
curl -X POST localhost:3000/api/cron/daily -H "Authorization: Bearer $CRON_SECRET"
```

HTTPS 프록시를 거쳐야 하는 환경(클라우드 세션 등)에서는 Node `fetch`가 프록시를 쓰도록 **`NODE_USE_ENV_PROXY=1`** 을 붙여 실행하세요
(예: `NODE_USE_ENV_PROXY=1 pnpm ingest:tour`, `NODE_USE_ENV_PROXY=1 pnpm dev`).

Docker가 없으면 로컬 PostgreSQL 16 + `postgresql-16-postgis-3` 패키지로도 됩니다(`CREATE EXTENSION postgis`는 마이그레이션이 수행).

## 환경변수

| 변수 | 설명 | 없을 때 |
|---|---|---|
| `DATABASE_URL` | Postgres 접속 문자열 | `postgres://postgres:postgres@localhost:5432/trip` |
| `TOUR_API_KEY` | 공공데이터포털 "한국관광공사_국문 관광정보 서비스_GW" **Decoding** 키 | 합성 픽스처(`fixtures/tour/*.synthetic.json`) |
| `TOUR_MOCK` | `1`이면 키가 있어도 픽스처 사용 (네트워크가 막힌 환경 등) | - |
| `KAKAO_REST_KEY` | 카카오디벨로퍼스 REST 키 (길찾기, 주소 검색) | 직선거리 기반 mock 라우터, 주소 검색 비활성 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 지도 JS 키 (**클라이언트에 노출됨**) | SVG 개략도 |
| `OPINET_KEY` | 오피넷 유가 API 키 | 설정 기본 유가 1,700원/L 또는 사용자 입력 |
| `TAGO_API_KEY` | (Phase 6, 미구현) | - |
| `NODE_USE_ENV_PROXY` | `1`이면 Node fetch가 `HTTPS_PROXY`를 사용 (프록시 환경 필수) | 직접 연결 |
| `CRON_SECRET` | `POST /api/cron/daily` Bearer 토큰 | cron 엔드포인트 항상 401 |
| `INGEST_MAX_CALLS` | (개발용) 실행당 TourAPI 호출 상한 — 체크포인트 재개 확인용 | 무제한 |
| `PET_BUDGET` | `ingest:pet` 실행당 호출 수 | 300 |

키는 코드·픽스처·클라이언트 번들에 넣지 않습니다. 예외는 카카오 지도 JS 키뿐이며, 카카오디벨로퍼스 콘솔
**[앱] → [플랫폼] → Web 사이트 도메인**에 서비스 도메인(예: `http://localhost:3000`, 운영 도메인)만 등록해 다른 곳에서
쓰지 못하게 하세요. probe 스크립트는 저장 직전에 키 문자열이 남아 있으면 실패합니다.

## 아키텍처

```mermaid
flowchart LR
  subgraph Batch["배치 (scripts/, cron)"]
    IT[ingest:tour<br/>ldongCode2 + areaBasedList2] --> DB
    IF[ingest:festivals<br/>searchFestival2 60일] --> DB
    IP[ingest:pet<br/>detailPetTour2] --> DB
    IFU[ingest:fuel<br/>오피넷] --> DB
    CR[POST /api/cron/daily] --> IF & IFU
  end
  TOUR[(TourAPI<br/>1,000건/일)] -.-> IT & IF & IP
  DB[(PostgreSQL + PostGIS<br/>regions · pois · festivals<br/>api_cache · api_usage · ingest_runs · fuel_prices)]
  subgraph Web["Next.js (App Router)"]
    UI["/ 폼 → /results → /compare · /regions/[code]"] --> C[lib/compare.ts]
    API["POST /api/compare"] --> C
    C --> COST[lib/cost.ts] & SC[lib/scoring.ts]
    C --> R[lib/routing/kakao.ts<br/>쿼터 가드 80%]
    C <--> DB
    UI -. 슬라이더 재정렬 .-> SC
  end
  R -. 캐시 MISS 시만 .-> KAKAO[(카카오모빌리티<br/>길찾기)]
  R <--> DB
```

비교 요청 한 번의 흐름 (`lib/compare.ts`):

1. **결과 캐시** (가중치 제외 입력 + 1km 반올림 출발지, 10분) HIT이면 즉시 반환하고 가중치만 다시 적용.
2. **1차 직선거리 필터** — PostGIS `ST_Distance`로 편도 상한(당일 250km / 1박 400km) 초과와, 출발지 20km 미만(같은 생활권) 제외. 섬(제주·울릉)은 육지 출발 시 제외.
3. **직선거리 추정** — 모든 후보에 도로 계수 1.3과 평균 속도로 거리·시간을 추정.
4. **자동차 길찾기 단건** — 예비 점수 상위 **40곳**만 실제 거리·시간·통행료 (캐시 30일). 결과 코드가 실패면 "자동차로 갈 수 없는 곳"으로 제외.
5. **추정 보정** — 나머지 후보는 4단계의 실측/추정 비율 중앙값으로 거리·시간을 보정("보정 추정" 배지). 통행료는 "미계산"이고 총비용 옆에 `+`.
6. **주말 보정** — 상위 10곳만 미래 운행 정보로 "선택 날짜 09:00 출발" 소요시간 (캐시 7일, 쿼터 가드 통과 시만).
7. 비용·점수 계산 후 결과 캐시에 저장.

> 명세는 2단계에서 **다중 목적지 길찾기**(30개씩)를 쓰도록 했지만, 공식 문서상 다중 목적지·다중 출발지의 `radius`는 **최대 10km**라
> 20~400km 비교에 쓸 수 없어 위 절차로 바꿨습니다 ([api-notes §2](docs/api-notes.md)).

외부 API가 실패하거나 쿼터 가드에 막히면: 만료된 캐시가 있으면 그 값으로 응답하고 **"최신 아님"** 배지, 없으면 보정 없는 **"직선거리 추정"** 배지.

## 계산 규칙

- **후보**: 법정동 시군구. 일반구(수원시 장안구 등)는 상위 시로 합산(실측: 장소가 구 코드로 옴). 대표 좌표 = 관광지(12)·문화시설(14) 좌표 중앙값. 관광지 3개 미만이면 제외(로그 출력).
- **축제**: 일정과 겹치는 축제(15). 31일을 넘는 행사(연중 전시·상설 공연, 실측 약 18%)는 "장기 행사"로 표시만 하고 축제 보너스에서 뺌.
- **교통비** = 왕복 km × 유가 ÷ 연비 + 왕복 통행료. 연비가 0 이하/NaN이면 기본 12km/L로 대체하고 메모.
- **숙박비** = 1박 예산 입력값(없으면 기본 100,000원). TourAPI에 숙박 가격이 없으므로 지어내지 않고, 숙박시설 수만 참고 지표로 표시.
- **식비·입장료** = 1인 1일 입력값(기본 40,000원) × 인원 × 일수.
- 총비용 > 예산이면 "예산 초과"로 기본 목록에서 숨김(토글로 보기). 총비용 = 예산은 예산 안.
- **점수** = w_time × 시간점수 + w_cost × 비용점수 + w_poi × 볼거리점수 (+ 축제 선호 시 진행 중 축제 보너스 0.1).
  시간·비용은 후보 집합 min-max 후 뒤집기, 볼거리는 선호 타입 개수 합의 `log1p` min-max. 가중치는 합 1로 정규화(모두 0이면 0.4/0.3/0.3).
  반려동물 선택 시 볼거리 개수에 동반 가능 장소 수 × 2를 더함. 각 항목 기여도를 함께 반환해 UI의 막대와 "왜 이 순위인지"에 표시.
- 선호 → 콘텐츠 타입: 자연·관광지 12, 문화 14, 액티비티 28, 맛집 39, 축제 = 일정과 겹치는 축제(15) 보너스. 선호를 안 고르면 12·14·28.

## 무료 쿼터 계산

| API | 무료/일 | 이 서비스의 사용 | 비고 |
|---|---|---|---|
| TourAPI | 1,000 | 최초 전체 적재: **실측 38회** (시군구 1 + 5개 타입 35,431건 ÷ 1000건/페이지). 실행당 900회(90%)에서 체크포인트 저장 후 중단, 다음 날 이어받음 | 한도의 4% |
| | | 매일: 축제 60일 범위 1회(286건) + 반려동물 `PET_BUDGET`(300)회 | 합계 ~300회/일 |
| 카카오 길찾기 | 10,000 | **출발지 1곳(1km 셀)당 최대 40회** (예비 상위 40곳의 거리·시간·통행료) | 80%(8,000회) 가드 → 새 출발지 셀 하루 약 200곳. 30일 캐시 |
| 카카오 다중 목적지 | 1,000 | 사용 안 함 (radius 최대 10km) | |
| 카카오 미래 운행 | 5,000 | 출발지 셀당 최대 10회 × 출발 날짜 | 80% 가드 → 400셀/일. 7일 캐시 |
| 카카오 로컬(주소 검색) | 별도 | 검색 1회당 1회, 30일 캐시 | 쿼터는 카카오 정책 확인 필요 |
| 오피넷 | - | 하루 1회 | |

같은 출발지(반올림 1km 셀)로 다시 조회하면 결과 캐시(10분) 또는 경로 캐시(7/30일)로 응답해 외부 호출이 0회입니다.
사용량은 `api_usage`(KST 일자별)에 기록되고 `GET /api/health`에서 볼 수 있습니다.

## 디렉터리

```
app/                    페이지와 API 라우트 (/, /results, /compare, /regions/[code], /api/*)
components/             UI 컴포넌트
lib/
  tour/                 TourAPI 클라이언트(live/mock), zod 스키마와 정규화, 쿼터 기록
  routing/kakao.ts      카카오 길찾기 클라이언트(live/mock), 쿼터 가드
  compare.ts            비교 절차 (캐시·필터·라우팅·비용·점수)
  cost.ts, scoring.ts   순수 함수
  cache.ts, usage.ts    api_cache, api_usage
  regions.ts, jobs.ts   대표 좌표 계산, 축제/유가/캐시 정리 작업
scripts/                ingest-*, probe/*, fixtures/make-synthetic.ts, migrate.ts
fixtures/tour/          *.synthetic.json (합성), probe/ (실측 녹화 위치)
drizzle/                마이그레이션 SQL
docs/api-notes.md       API 실측 노트 (미확인 항목)
```

## 기술 스택과 변경 사항

명세의 스택(Next.js App Router, TypeScript strict, PostgreSQL+PostGIS, Drizzle, zod, Vitest, pnpm)을 그대로 따랐습니다. 세부 결정:

- **버전**: Next 16, React 19, zod 4, Drizzle 0.45. TypeScript는 7.x(네이티브 포트)가 최신이지만 Next/ESLint 툴체인 호환을 위해 **5.9로 고정**했습니다.
- **PostGIS 타입**: Drizzle에 geography 타입이 없어 `customType`과 `lon`/`lat`에서 만드는 **generated column**으로 정의했습니다.
  `drizzle-kit generate`가 타입명을 따옴표로 감싸므로 생성된 SQL에서 `"geography(Point, 4326)"`의 따옴표를 지워야 합니다(0000_init.sql 참고).
- **스타일**: 별도 CSS 프레임워크 없이 `app/globals.css` 하나 (의존성 최소화).
- **지도**: Kakao Maps JS SDK. 키가 없거나 로드 실패 시 SVG 개략도로 대체.
- **`TOUR_MOCK`** 환경변수 추가 (키는 있으나 네트워크가 막힌 환경용).
- **다중 목적지 미사용**: radius 10km 제한 때문에 자동차 길찾기 단건(상위 40곳) + 추정 보정으로 대체 (위 흐름 참고).
- **일반구 합산**, **장기 행사 보너스 제외**: 실측 데이터 특성에 맞춘 규칙 (api-notes 참고).
- **최소 거리 20km**: 명세에 없지만, 출발지와 같은 생활권(예: 서울 출발 시 서울 구)이 이동시간 점수로 상위를 차지해서 기본 제외했습니다. 폼에서 0으로 바꿀 수 있습니다.

## 알려진 한계

- **카카오 응답 미실측**: 엔드포인트·파라미터는 공식 문서로 확인했지만 키가 없어 응답은 실측 전입니다. 지금 경로 값은 mock입니다.
- **경로 정확도**: 예비 상위 40곳 밖은 보정된 직선거리 추정입니다. 예비 점수가 추정에 기반하므로, 추정이 크게 틀린 곳(우회가 큰 해안·산간)은 순위가 실제와 다를 수 있습니다.
- **합성 픽스처**: 키 없이 돌리면 쓰는 `fixtures/tour/*.synthetic.json`은 가짜 데이터입니다(`[합성]`).
- **비용은 추정**: 숙박·식비·입장료는 실제 가격이 아니라 입력값/기본값입니다. 통행료는 상위 40곳만 계산하고, 차종·할인·유류 종류는 반영하지 않습니다.
- **대표 좌표 = 장소 중앙값**: 넓은 군(郡)은 실제 목적지와 수십 km 차이가 날 수 있습니다.
- **볼거리 = 개수**: 인기도·품질 지표가 없어 장소가 많이 등록된 곳이 유리합니다. "대표 장소"도 이미지 보유 우선의 단순 규칙입니다.
- **반려동물**: 장소당 1회 호출이라 전국 수집에 수일이 걸리고, 실측 표본에서 정보가 있는 장소는 12.5%뿐입니다. 미수집·정보 없음은 0으로 취급합니다.
- **변경분 동기화(`areaBasedSyncList2`)** 미구현 — 전체 재적재(upsert)만 지원합니다.
- **대중교통 모드(Phase 6)** 미구현 — 키 없음 + 호스트 차단.
- 섬은 자동차 경로가 없어 제외됩니다. 추정 단계에서는 제주·울릉만 판정하고, 나머지 섬은 실제 길찾기(상위 40곳)에서 걸러집니다.
- 점수 정규화는 반환된 후보 전체(예산 초과 포함) 기준입니다.

## 데이터 출처

관광정보: 한국관광공사 TourAPI 4.0 (국문 관광정보 서비스_GW), 공공누리. 화면 푸터와 시군구 상세에 표기합니다.
