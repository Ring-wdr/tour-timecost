import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTourResponse, TourApiError, TourQuotaError, MockTourClient } from "@/lib/tour/client";
import { areaItem, parseCoord, parsePetAllowed, regionCodeOf } from "@/lib/tour/schema";

const edge = (f: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", "tour", "edge", f), "utf8");

describe("TourAPI 응답 정규화 (합성 픽스처)", () => {
  it("items가 빈 문자열이면 빈 배열", () => {
    const page = parseTourResponse(edge("empty-items.synthetic.json"), areaItem);
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });
  it("item이 단일 객체면 길이 1 배열", () => {
    const page = parseTourResponse(edge("single-item.synthetic.json"), areaItem);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.contentid).toMatch(/^9\d{6}$/);
  });
  it("resultCode가 0000이 아니면 오류", () => {
    expect(() => parseTourResponse(edge("error-code.synthetic.json"), areaItem)).toThrow(TourApiError);
  });
  it("한도 초과 XML은 TourQuotaError", () => {
    expect(() => parseTourResponse(edge("quota-exceeded.synthetic.xml"), areaItem)).toThrow(TourQuotaError);
  });
  it("숫자로 온 필드도 문자열로 받는다", () => {
    const text = JSON.stringify({
      response: { header: { resultCode: "0000" }, body: { items: { item: { contentid: 1, contenttypeid: 12, title: "x", mapx: 127.1, mapy: 37.5 } }, totalCount: "1" } },
    });
    const page = parseTourResponse(text, areaItem);
    expect(page.items[0]!.contentid).toBe("1");
    expect(page.items[0]!.mapx).toBe("127.1");
  });
});

describe("필드 파서", () => {
  it("좌표: 정상/빈 값/0/범위 밖", () => {
    expect(parseCoord("127.5", "37.8")).toEqual({ lon: 127.5, lat: 37.8 });
    expect(parseCoord(undefined, "37")).toBeNull();
    expect(parseCoord("0", "0")).toBeNull();
    expect(parseCoord("37.8", "127.5")).toBeNull(); // x/y 뒤바뀜
  });
  it("반려동물 동반 구분 해석", () => {
    expect(parsePetAllowed({ contentid: "1", acmpyTypeCd: "일부구역 동반가능" })).toBe(true);
    expect(parsePetAllowed({ contentid: "1", acmpyTypeCd: "동반불가" })).toBe(false);
    expect(parsePetAllowed({ contentid: "1" })).toBeNull();
    expect(parsePetAllowed(undefined)).toBeNull();
  });
  it("시군구 코드는 시도+시군구", () => {
    expect(regionCodeOf({ lDongRegnCd: "41", lDongSignguCd: "820" })).toBe("41820");
    expect(regionCodeOf({ lDongRegnCd: "41" })).toBeNull();
  });
});

describe("MockTourClient", () => {
  const client = new MockTourClient();
  it("페이지 단위로 자른다", async () => {
    const p1 = await client.areaBasedList({ contentTypeId: 12, pageNo: 1, numOfRows: 100 });
    const p2 = await client.areaBasedList({ contentTypeId: 12, pageNo: 2, numOfRows: 100 });
    expect(p1.items).toHaveLength(100);
    expect(p1.items[0]!.contentid).not.toBe(p2.items[0]!.contentid);
    expect(p1.totalCount).toBeGreaterThan(200);
  });
  it("축제는 기간이 겹치는 것만", async () => {
    const page = await client.searchFestival({ eventStartDate: "20261010", eventEndDate: "20261011", pageNo: 1, numOfRows: 1000 });
    for (const f of page.items) {
      expect(f.eventenddate >= "20261010").toBe(true);
      expect(f.eventstartdate <= "20261011").toBe(true);
    }
  });
});
