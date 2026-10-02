/** TourAPI 실측: 대표 요청을 보내 원본 응답을 fixtures/tour/probe/ 에 저장 */
import "dotenv/config";
import { config } from "@/lib/config";
import { saveProbe } from "./_save";

const key = process.env.TOUR_API_KEY;
if (!key) {
  console.log("[probe:tour] TOUR_API_KEY 없음 → 건너뜀 (mock 사용)");
  process.exit(0);
}

const common = { MobileOS: "ETC", MobileApp: config.tour.mobileApp, _type: "json" };
const cases: [string, string, Record<string, string>][] = [
  ["ldongCode2-sido", "ldongCode2", { numOfRows: "3", pageNo: "1" }],
  ["ldongCode2-list", "ldongCode2", { lDongListYn: "Y", numOfRows: "3", pageNo: "1" }],
  ["areaBasedList2-12-gapyeong", "areaBasedList2", { contentTypeId: "12", lDongRegnCd: "41", lDongSignguCd: "820", numOfRows: "2", pageNo: "1", arrange: "C" }],
  ["areaBasedList2-single", "areaBasedList2", { contentTypeId: "12", lDongRegnCd: "41", lDongSignguCd: "820", numOfRows: "1", pageNo: "1" }],
  ["areaBasedList2-zero", "areaBasedList2", { contentTypeId: "12", lDongRegnCd: "41", lDongSignguCd: "820", numOfRows: "10", pageNo: "9999" }],
  ["areaBasedList2-signgu-without-regn", "areaBasedList2", { contentTypeId: "12", lDongSignguCd: "820", numOfRows: "1", pageNo: "1" }],
  ["areaBasedList2-types-totalcount", "areaBasedList2", { numOfRows: "1", pageNo: "1" }],
  ["searchFestival2", "searchFestival2", { eventStartDate: "20261003", eventEndDate: "20261004", numOfRows: "2", pageNo: "1" }],
  ["areaBasedSyncList2", "areaBasedSyncList2", { numOfRows: "2", pageNo: "1" }],
];
for (const t of [14, 15, 28, 32, 38, 39]) cases.push([`areaBasedList2-${t}-count`, "areaBasedList2", { contentTypeId: String(t), numOfRows: "1", pageNo: "1" }]);

async function call(name: string, op: string, params: Record<string, string>) {
  const url = `${config.tour.baseUrl}/${op}?serviceKey=${encodeURIComponent(key!)}&${new URLSearchParams({ ...common, ...params })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    saveProbe("tour", name, { url }, res.status, text, [key!]);
    return text;
  } catch (e) {
    console.error(`[probe] ${name} 실패:`, (e as Error).message, (e as Error).cause ?? "");
    return null;
  }
}

for (const [name, op, params] of cases) await call(name, op, params);

// 상세: 첫 관광지 contentId로
const first = await call("_first", "areaBasedList2", { contentTypeId: "12", numOfRows: "1", pageNo: "1" });
const id = first ? JSON.parse(first)?.response?.body?.items?.item?.[0]?.contentid ?? JSON.parse(first)?.response?.body?.items?.item?.contentid : null;
if (id) {
  await call("detailCommon2", "detailCommon2", { contentId: String(id) });
  await call("detailIntro2", "detailIntro2", { contentId: String(id), contentTypeId: "12" });
  await call("detailPetTour2", "detailPetTour2", { contentId: String(id) });
}
