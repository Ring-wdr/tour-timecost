import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/** PostGIS geography(Point, 4326). lon/lat 컬럼에서 생성되므로 앱 코드는 읽기만 한다. */
const geographyPoint = customType<{ data: string }>({
  dataType: () => "geography(Point, 4326)",
});

const pointFromLonLat = sql`CASE WHEN lon IS NULL OR lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography END`;

export const regions = pgTable("regions", {
  /** 법정동 시도(2) + 시군구(3) = 5자리 */
  code: text("code").primaryKey(),
  regnCd: text("regn_cd").notNull(),
  signguCd: text("signgu_cd").notNull(),
  sidoName: text("sido_name").notNull(),
  name: text("name").notNull(),
  lon: doublePrecision("lon"),
  lat: doublePrecision("lat"),
  geom: geographyPoint("geom").generatedAlwaysAs(pointFromLonLat),
  isCandidate: boolean("is_candidate").notNull().default(false),
  excludedReason: text("excluded_reason"),
  /** 콘텐츠 타입 ID → 개수 */
  typeCounts: jsonb("type_counts").$type<Record<string, number>>().notNull().default({}),
  imageRatio: doublePrecision("image_ratio").notNull().default(0),
  petCount: integer("pet_count").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }),
});

export const pois = pgTable(
  "pois",
  {
    contentId: text("content_id").primaryKey(),
    contentTypeId: integer("content_type_id").notNull(),
    title: text("title").notNull(),
    addr: text("addr"),
    lon: doublePrecision("lon"),
    lat: doublePrecision("lat"),
    geom: geographyPoint("geom").generatedAlwaysAs(pointFromLonLat),
    regionCode: text("region_code"),
    imageUrl: text("image_url"),
    /** null = 반려동물 정보 미수집 */
    petAllowed: boolean("pet_allowed"),
    petInfo: jsonb("pet_info"),
    modifiedTime: text("modified_time"),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pois_region_type_idx").on(t.regionCode, t.contentTypeId)],
);

export const festivals = pgTable(
  "festivals",
  {
    contentId: text("content_id").primaryKey(),
    title: text("title").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    lon: doublePrecision("lon"),
    lat: doublePrecision("lat"),
    geom: geographyPoint("geom").generatedAlwaysAs(pointFromLonLat),
    regionCode: text("region_code"),
    addr: text("addr"),
    imageUrl: text("image_url"),
    raw: jsonb("raw").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("festivals_region_dates_idx").on(t.regionCode, t.startDate, t.endDate)],
);

export const apiCache = pgTable(
  "api_cache",
  {
    key: text("key").primaryKey(),
    namespace: text("namespace").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("api_cache_expires_idx").on(t.expiresAt)],
);

export const apiUsage = pgTable(
  "api_usage",
  {
    day: date("day").notNull(),
    api: text("api").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.api] })],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  status: text("status").notNull(), // running | done | paused | failed
  source: text("source").notNull(), // live | mock
  checkpoint: jsonb("checkpoint"),
  stats: jsonb("stats"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const fuelPrices = pgTable(
  "fuel_prices",
  {
    day: date("day").notNull(),
    area: text("area").notNull(), // "ALL" = 전국
    product: text("product").notNull(), // 오피넷 제품 코드 (휘발유 B027)
    price: doublePrecision("price").notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.area, t.product] })],
);
