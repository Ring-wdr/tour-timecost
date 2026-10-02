import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "@/lib/config";
import { env, useTourMock } from "@/lib/env";
import {
  areaItem,
  envelope,
  festivalItem,
  ldongItem,
  normalizeItems,
  petItem,
  type AreaItem,
  type FestivalItem,
  type LdongItem,
  type PetItem,
} from "./schema";

export class TourQuotaError extends Error {}
export class TourApiError extends Error {}

export interface Page<T> {
  items: T[];
  totalCount: number;
  pageNo: number;
}

export interface TourClient {
  source: "live" | "mock";
  ldongCodes(pageNo: number): Promise<Page<LdongItem>>;
  areaBasedList(p: { contentTypeId: number; pageNo: number; numOfRows: number }): Promise<Page<AreaItem>>;
  searchFestival(p: { eventStartDate: string; eventEndDate: string; pageNo: number; numOfRows: number }): Promise<Page<FestivalItem>>;
  detailPetTour(contentId: string): Promise<PetItem | undefined>;
}

/** 원본 응답 텍스트를 파싱. 한도 초과 등 data.go.kr 게이트웨이 오류는 XML로 오는 것으로 알려져 있다(미확인). */
export function parseTourResponse<T extends z.ZodTypeAny>(text: string, item: T): Page<z.infer<T>> {
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(text)) throw new TourQuotaError("TourAPI 일일 호출 한도 초과");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const reason = text.match(/<returnAuthMsg>([^<]+)</)?.[1] ?? text.slice(0, 200);
    throw new TourApiError(`TourAPI 비JSON 응답: ${reason}`);
  }
  const parsed = envelope(item).parse(json);
  const { header, body } = parsed.response;
  if (header.resultCode !== "0000") throw new TourApiError(`TourAPI ${header.resultCode} ${header.resultMsg ?? ""}`);
  return {
    items: normalizeItems(body?.items) as z.infer<T>[],
    totalCount: body?.totalCount ?? 0,
    pageNo: body?.pageNo ?? 1,
  };
}

class LiveTourClient implements TourClient {
  source = "live" as const;
  calls = 0;
  constructor(private key: string) {}

  private async get(op: string, params: Record<string, string | number>): Promise<string> {
    const qs = new URLSearchParams({
      MobileOS: "ETC",
      MobileApp: config.tour.mobileApp,
      _type: "json",
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    // serviceKey는 Decoding 키를 그대로 인코딩해서 붙인다
    const url = `${config.tour.baseUrl}/${op}?serviceKey=${encodeURIComponent(this.key)}&${qs}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= config.tour.maxRetries; attempt++) {
      try {
        this.calls++;
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        const text = await res.text();
        if (res.status >= 500) throw new TourApiError(`HTTP ${res.status}`);
        return text;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  async ldongCodes(pageNo: number) {
    return parseTourResponse(await this.get("ldongCode2", { lDongListYn: "Y", numOfRows: 1000, pageNo }), ldongItem);
  }
  async areaBasedList(p: { contentTypeId: number; pageNo: number; numOfRows: number }) {
    return parseTourResponse(await this.get("areaBasedList2", { ...p, arrange: "C" }), areaItem);
  }
  async searchFestival(p: { eventStartDate: string; eventEndDate: string; pageNo: number; numOfRows: number }) {
    return parseTourResponse(await this.get("searchFestival2", { ...p, arrange: "C" }), festivalItem);
  }
  async detailPetTour(contentId: string) {
    const page = parseTourResponse(await this.get("detailPetTour2", { contentId, numOfRows: 1, pageNo: 1 }), petItem);
    return page.items[0];
  }
}

/** 녹화(또는 합성) 픽스처로 응답하는 클라이언트. 파일 이름에 synthetic이 있으면 합성 데이터다. */
export class MockTourClient implements TourClient {
  source = "mock" as const;
  constructor(private dir = path.join(process.cwd(), "fixtures", "tour")) {}

  private load(name: string): string {
    const candidates = [`${name}.json`, `${name}.synthetic.json`];
    for (const c of candidates) {
      const p = path.join(this.dir, c);
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    }
    throw new Error(`픽스처 없음: ${name} (pnpm fixtures:synthetic 또는 pnpm probe:tour)`);
  }

  private paginate<T>(all: Page<T>, pageNo: number, numOfRows: number): Page<T> {
    const start = (pageNo - 1) * numOfRows;
    return { items: all.items.slice(start, start + numOfRows), totalCount: all.totalCount, pageNo };
  }

  async ldongCodes(pageNo: number) {
    return this.paginate(parseTourResponse(this.load("ldongCode2"), ldongItem), pageNo, 1000);
  }
  async areaBasedList(p: { contentTypeId: number; pageNo: number; numOfRows: number }) {
    return this.paginate(parseTourResponse(this.load(`areaBasedList2-${p.contentTypeId}`), areaItem), p.pageNo, p.numOfRows);
  }
  async searchFestival(p: { eventStartDate: string; eventEndDate: string; pageNo: number; numOfRows: number }) {
    const all = parseTourResponse(this.load("searchFestival2"), festivalItem);
    const items = all.items.filter((f) => f.eventenddate >= p.eventStartDate && f.eventstartdate <= p.eventEndDate);
    return this.paginate({ items, totalCount: items.length, pageNo: 1 }, p.pageNo, p.numOfRows);
  }
  async detailPetTour(contentId: string) {
    const all = parseTourResponse(this.load("detailPetTour2"), petItem);
    return all.items.find((i) => i.contentid === contentId);
  }
}

export function createTourClient(): TourClient {
  if (useTourMock()) return new MockTourClient();
  return new LiveTourClient(env.TOUR_API_KEY!);
}
