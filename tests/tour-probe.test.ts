/** 실측 녹화 응답(fixtures/tour/probe, 2026-10-02 수집, 키 제거)으로 파서 검증 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTourResponse } from "@/lib/tour/client";
import { areaItem, festivalItem, httpsImage, ldongItem, parseCoord, petItem, regionCodeOf } from "@/lib/tour/schema";

const dir = path.join(__dirname, "..", "fixtures", "tour", "probe");
const raw = (name: string) => JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")).body);

describe.skipIf(!fs.existsSync(dir))("TourAPI 실측 응답", () => {
  it("녹화 파일에 키가 없다", () => {
    for (const f of fs.readdirSync(dir)) {
      const s = fs.readFileSync(path.join(dir, f), "utf8");
      expect(s).toContain("serviceKey=<REDACTED>");
      expect(s).not.toMatch(/serviceKey=[0-9a-f]{20,}/);
    }
  });
  it("0건: items가 빈 문자열", () => {
    const p = parseTourResponse(raw("areaBasedList2-zero"), areaItem);
    expect(p.items).toEqual([]);
    expect(p.totalCount).toBe(85);
  });
  it("1건(numOfRows=1)도 정규화 결과 길이 1", () => {
    expect(parseTourResponse(raw("areaBasedList2-single"), areaItem).items).toHaveLength(1);
  });
  it("관광지: 좌표·법정동 코드 파싱", () => {
    const [it0] = parseTourResponse(raw("areaBasedList2-12-gapyeong"), areaItem).items;
    expect(regionCodeOf(it0!)).toBe("41820");
    const c = parseCoord(it0!.mapx, it0!.mapy)!;
    expect(c.lon).toBeGreaterThan(127);
    expect(c.lat).toBeGreaterThan(37);
  });
  it("법정동 목록 (lDongListYn=Y)", () => {
    const p = parseTourResponse(raw("ldongCode2-list"), ldongItem);
    expect(p.items[0]).toMatchObject({ lDongRegnCd: "11", lDongSignguCd: "110", lDongSignguNm: "종로구" });
    expect(p.totalCount).toBeGreaterThan(200);
  });
  it("축제 기간 필드", () => {
    const [f] = parseTourResponse(raw("searchFestival2"), festivalItem).items;
    expect(f!.eventstartdate).toMatch(/^\d{8}$/);
    expect(f!.eventenddate).toMatch(/^\d{8}$/);
  });
  it("반려동물 정보 없는 장소는 빈 결과", () => {
    expect(parseTourResponse(raw("detailPetTour2"), petItem).items).toEqual([]);
  });
  it("http 이미지는 https로", () => {
    expect(httpsImage("http://tong.visitkorea.or.kr/cms/a.jpg")).toBe("https://tong.visitkorea.or.kr/cms/a.jpg");
    expect(httpsImage("")).toBeNull();
  });
});
