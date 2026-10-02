import { z } from "zod";
import { config } from "@/lib/config";

/** 클라이언트·서버 공용 입력 스키마 */
export const PREFS = ["nature", "culture", "activity", "food", "festival"] as const;
export type Pref = (typeof PREFS)[number];

export const PREF_LABEL: Record<Pref, string> = {
  nature: "자연·관광지",
  culture: "문화",
  activity: "액티비티",
  food: "맛집",
  festival: "축제",
};

/** 선호 → TourAPI 콘텐츠 타입 (축제는 별도 지표) */
export const PREF_TYPES: Record<Exclude<Pref, "festival">, number> = { nature: 12, culture: 14, activity: 28, food: 39 };

export const TYPE_LABEL: Record<string, string> = {
  "12": "관광지",
  "14": "문화시설",
  "15": "축제",
  "28": "레포츠",
  "32": "숙박",
  "38": "쇼핑",
  "39": "음식점",
};

export const compareInputSchema = z.object({
  origin: z.object({
    lon: z.number().min(124).max(132),
    lat: z.number().min(33).max(39),
    label: z.string().max(100).optional(),
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tripType: z.enum(["daytrip", "overnight"]),
  people: z.number().int().min(1).max(20),
  budget: z.number().min(0).max(100_000_000),
  fuelEfficiency: z.number().min(0).max(100).default(config.defaults.fuelEfficiencyKmPerL),
  /** 비우면 오피넷 최신값 → 설정 기본값 */
  fuelPrice: z.number().min(0).max(10_000).optional(),
  lodgingPerNight: z.number().min(0).max(10_000_000).optional(),
  dailySpendPerPerson: z.number().min(0).max(10_000_000).optional(),
  prefs: z.array(z.enum(PREFS)).default([]),
  pet: z.boolean().default(false),
  maxOneWayKm: z.number().min(10).max(600).optional(),
  weights: z
    .object({ time: z.number(), cost: z.number(), poi: z.number() })
    .default({ ...config.defaults.weights }),
});
export type CompareInput = z.infer<typeof compareInputSchema>;

/** URL 검색 파라미터 ↔ 입력 (결과/비교 페이지 공용) */
export function inputToSearchParams(i: CompareInput): URLSearchParams {
  const p = new URLSearchParams({
    lon: String(i.origin.lon),
    lat: String(i.origin.lat),
    date: i.date,
    trip: i.tripType,
    people: String(i.people),
    budget: String(i.budget),
    eff: String(i.fuelEfficiency),
    prefs: i.prefs.join(","),
    pet: i.pet ? "1" : "0",
    w: `${i.weights.time},${i.weights.cost},${i.weights.poi}`,
  });
  if (i.origin.label) p.set("from", i.origin.label);
  if (i.fuelPrice !== undefined) p.set("fuel", String(i.fuelPrice));
  if (i.lodgingPerNight !== undefined) p.set("lodging", String(i.lodgingPerNight));
  if (i.dailySpendPerPerson !== undefined) p.set("spend", String(i.dailySpendPerPerson));
  if (i.maxOneWayKm !== undefined) p.set("maxkm", String(i.maxOneWayKm));
  return p;
}

export function searchParamsToInput(sp: URLSearchParams): CompareInput {
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const w = (sp.get("w") ?? "").split(",").map(Number);
  return compareInputSchema.parse({
    origin: { lon: num("lon"), lat: num("lat"), label: sp.get("from") ?? undefined },
    date: sp.get("date"),
    tripType: sp.get("trip") ?? "daytrip",
    people: num("people") ?? 2,
    budget: num("budget") ?? 0,
    fuelEfficiency: num("eff"),
    fuelPrice: num("fuel"),
    lodgingPerNight: num("lodging"),
    dailySpendPerPerson: num("spend"),
    prefs: (sp.get("prefs") ?? "").split(",").filter(Boolean),
    pet: sp.get("pet") === "1",
    maxOneWayKm: num("maxkm"),
    weights: w.length === 3 && w.every(Number.isFinite) ? { time: w[0], cost: w[1], poi: w[2] } : undefined,
  });
}

/** 기준 날짜 이후(포함) 가장 가까운 토요일 YYYY-MM-DD (KST) */
export function upcomingSaturday(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const add = (6 - kst.getUTCDay() + 7) % 7;
  return new Date(kst.getTime() + add * 86_400_000).toISOString().slice(0, 10);
}
