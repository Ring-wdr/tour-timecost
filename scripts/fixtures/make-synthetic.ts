/**
 * 합성(synthetic) TourAPI 픽스처 생성기.
 *
 * 이 환경에서는 apis.data.go.kr 접근이 막혀 실측 픽스처를 만들 수 없어서,
 * 공개 문서에 알려진 응답 구조를 흉내 낸 합성 데이터를 만든다.
 * - 파일 이름에 .synthetic. 이 붙는다.
 * - 장소 이름은 모두 "[합성]"으로 시작하고 contentid는 9,000,000 이상이다.
 * - 시군구 코드/이름/중심 좌표는 법정동 기준 근사값(기억 기반, 미검증)이다.
 * 실데이터가 확보되면 pnpm probe:tour 로 녹화한 픽스처가 같은 이름(.json)으로 우선 사용된다.
 */
import fs from "node:fs";
import path from "node:path";

type R = [regn: string, regnNm: string, signgu: string, signguNm: string, lon: number, lat: number, richness: number];

// richness: 0 = 관광지 거의 없음(후보 제외 케이스), 1~3 = 볼거리 정도
const REGIONS: R[] = [
  ["11", "서울특별시", "110", "종로구", 126.979, 37.573, 3],
  ["11", "서울특별시", "680", "강남구", 127.047, 37.517, 2],
  ["11", "서울특별시", "740", "강동구", 127.124, 37.530, 0],
  ["28", "인천광역시", "710", "강화군", 126.488, 37.747, 2],
  ["28", "인천광역시", "720", "옹진군", 126.636, 37.447, 0],
  ["41", "경기도", "820", "가평군", 127.510, 37.831, 3],
  ["41", "경기도", "830", "양평군", 127.487, 37.492, 2],
  ["41", "경기도", "650", "포천시", 127.200, 37.895, 2],
  ["41", "경기도", "480", "파주시", 126.780, 37.760, 2],
  ["41", "경기도", "111", "수원시 장안구", 127.010, 37.304, 1],
  ["41", "경기도", "590", "화성시", 126.831, 37.199, 1],
  ["51", "강원특별자치도", "110", "춘천시", 127.730, 37.881, 3],
  ["51", "강원특별자치도", "150", "강릉시", 128.876, 37.752, 3],
  ["51", "강원특별자치도", "210", "속초시", 128.592, 38.207, 3],
  ["51", "강원특별자치도", "760", "평창군", 128.390, 37.371, 2],
  ["51", "강원특별자치도", "720", "홍천군", 127.889, 37.697, 2],
  ["51", "강원특별자치도", "770", "정선군", 128.661, 37.381, 2],
  ["51", "강원특별자치도", "750", "영월군", 128.462, 37.184, 2],
  ["51", "강원특별자치도", "190", "태백시", 128.986, 37.164, 1],
  ["43", "충청북도", "800", "단양군", 128.366, 36.985, 3],
  ["43", "충청북도", "150", "제천시", 128.191, 37.133, 2],
  ["43", "충청북도", "130", "충주시", 127.926, 36.991, 2],
  ["43", "충청북도", "760", "괴산군", 127.786, 36.815, 1],
  ["44", "충청남도", "150", "공주시", 127.119, 36.446, 2],
  ["44", "충청남도", "760", "부여군", 126.910, 36.276, 2],
  ["44", "충청남도", "825", "태안군", 126.298, 36.746, 2],
  ["44", "충청남도", "180", "보령시", 126.613, 36.333, 2],
  ["30", "대전광역시", "140", "중구", 127.421, 36.325, 1],
  ["52", "전북특별자치도", "111", "전주시 완산구", 127.120, 35.812, 3],
  ["52", "전북특별자치도", "130", "군산시", 126.737, 35.968, 2],
  ["52", "전북특별자치도", "190", "남원시", 127.390, 35.416, 2],
  ["52", "전북특별자치도", "730", "무주군", 127.661, 36.007, 2],
  ["52", "전북특별자치도", "790", "고창군", 126.702, 35.436, 1],
  ["47", "경상북도", "130", "경주시", 129.225, 35.856, 3],
  ["47", "경상북도", "170", "안동시", 128.729, 36.568, 3],
  ["47", "경상북도", "280", "문경시", 128.187, 36.587, 2],
  ["47", "경상북도", "770", "영덕군", 129.365, 36.415, 1],
  ["47", "경상북도", "930", "울진군", 129.400, 36.993, 1],
  ["48", "경상남도", "220", "통영시", 128.433, 34.854, 3],
  ["48", "경상남도", "310", "거제시", 128.621, 34.880, 2],
  ["48", "경상남도", "840", "남해군", 127.892, 34.838, 2],
  ["48", "경상남도", "850", "하동군", 127.751, 35.067, 2],
  ["26", "부산광역시", "350", "해운대구", 129.163, 35.163, 3],
  ["46", "전라남도", "130", "여수시", 127.662, 34.760, 3],
  ["46", "전라남도", "150", "순천시", 127.487, 34.950, 3],
  ["46", "전라남도", "710", "담양군", 126.988, 35.321, 2],
  ["46", "전라남도", "780", "보성군", 127.080, 34.771, 1],
  ["46", "전라남도", "810", "강진군", 126.767, 34.642, 1],
  ["46", "전라남도", "110", "목포시", 126.392, 34.812, 2],
  ["50", "제주특별자치도", "110", "제주시", 126.531, 33.500, 3],
  ["50", "제주특별자치도", "130", "서귀포시", 126.560, 33.254, 3],
];

// 결정적 PRNG (mulberry32)
let seed = 20261002;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

const TYPE_LABEL: Record<number, string> = { 12: "관광지", 14: "문화시설", 28: "레포츠", 32: "숙박", 39: "음식점" };
// richness별 개수 범위
const COUNT_RANGE: Record<number, Record<number, [number, number]>> = {
  0: { 12: [0, 2], 14: [0, 1], 28: [0, 1], 32: [0, 2], 39: [1, 4] },
  1: { 12: [3, 8], 14: [0, 3], 28: [0, 3], 32: [2, 8], 39: [4, 12] },
  2: { 12: [6, 15], 14: [2, 6], 28: [1, 6], 32: [5, 15], 39: [8, 20] },
  3: { 12: [12, 25], 14: [4, 10], 28: [3, 8], 32: [10, 30], 39: [15, 35] },
};

const wrap = (items: unknown[]) => ({
  response: {
    header: { resultCode: "0000", resultMsg: "OK" },
    body: { items: items.length ? { item: items } : "", numOfRows: items.length, pageNo: 1, totalCount: items.length },
  },
});

const outDir = path.join(process.cwd(), "fixtures", "tour");
fs.mkdirSync(path.join(outDir, "edge"), { recursive: true });
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 1) + "\n");
  console.log("wrote", name);
};

write(
  "ldongCode2.synthetic.json",
  wrap(REGIONS.map(([regn, regnNm, sg, sgNm]) => ({ lDongRegnCd: regn, lDongRegnNm: regnNm, lDongSignguCd: sg, lDongSignguNm: sgNm }))),
);

let nextId = 9_000_000;
const byType: Record<number, unknown[]> = { 12: [], 14: [], 28: [], 32: [], 39: [] };
const pets: unknown[] = [];
const jitter = (km: number) => (rand() - 0.5) * 2 * (km / 100);

for (const [regn, , sg, sgNm, lon, lat, richness] of REGIONS) {
  for (const type of [12, 14, 28, 32, 39]) {
    const [min, max] = COUNT_RANGE[richness]![type]!;
    const n = randInt(min, max);
    for (let i = 1; i <= n; i++) {
      const id = String(nextId++);
      const hasImage = rand() < 0.35 + richness * 0.15;
      byType[type]!.push({
        contentid: id,
        contenttypeid: String(type),
        title: `[합성] ${sgNm} ${TYPE_LABEL[type]} ${i}`,
        addr1: `${sgNm} (합성 주소)`,
        addr2: "",
        mapx: (lon + jitter(8)).toFixed(10),
        mapy: (lat + jitter(6)).toFixed(10),
        firstimage: hasImage ? "/placeholder-synthetic.svg" : "",
        firstimage2: "",
        lDongRegnCd: regn,
        lDongSignguCd: sg,
        modifiedtime: "20260901120000",
      });
      if ((type === 12 || type === 39 || type === 32) && rand() < 0.3) {
        pets.push({
          contentid: id,
          acmpyTypeCd: rand() < 0.8 ? "일부구역 동반가능" : "동반불가",
          acmpyPsblCpam: "소형견 (합성)",
          acmpyNeedMtr: "목줄 착용 (합성)",
        });
      }
    }
  }
}
for (const type of [12, 14, 28, 32, 39]) write(`areaBasedList2-${type}.synthetic.json`, wrap(byType[type]!));
write("detailPetTour2.synthetic.json", wrap(pets));

// 축제: 2026-09-15 ~ 2026-12-15 사이에 분산
const fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const festivals: unknown[] = [];
const base = Date.UTC(2026, 8, 15);
for (const [regn, , sg, sgNm, lon, lat, richness] of REGIONS) {
  const n = richness === 0 ? 0 : randInt(0, richness);
  for (let i = 1; i <= n; i++) {
    const start = new Date(base + randInt(0, 85) * 86_400_000);
    const end = new Date(start.getTime() + randInt(0, 10) * 86_400_000);
    festivals.push({
      contentid: String(nextId++),
      contenttypeid: "15",
      title: `[합성] ${sgNm} 축제 ${i}`,
      addr1: `${sgNm} (합성 주소)`,
      mapx: (lon + jitter(5)).toFixed(10),
      mapy: (lat + jitter(4)).toFixed(10),
      firstimage: "",
      lDongRegnCd: regn,
      lDongSignguCd: sg,
      eventstartdate: fmt(start),
      eventenddate: fmt(end),
      modifiedtime: "20260901120000",
    });
  }
}
write("searchFestival2.synthetic.json", wrap(festivals));

// 정규화 테스트용 엣지 케이스 (보고된 형태를 흉내 낸 합성)
write("edge/empty-items.synthetic.json", {
  response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: "", numOfRows: 10, pageNo: 1, totalCount: 0 } },
});
write("edge/single-item.synthetic.json", {
  response: {
    header: { resultCode: "0000", resultMsg: "OK" },
    body: { items: { item: (byType[12] as unknown[])[0] }, numOfRows: 10, pageNo: 1, totalCount: 1 },
  },
});
write("edge/error-code.synthetic.json", {
  response: { header: { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" } },
});
fs.writeFileSync(
  path.join(outDir, "edge", "quota-exceeded.synthetic.xml"),
  `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>\n`,
);
console.log("wrote edge/quota-exceeded.synthetic.xml");
