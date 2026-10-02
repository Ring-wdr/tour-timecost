CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"day" date NOT NULL,
	"api" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_day_api_pk" PRIMARY KEY("day","api")
);
--> statement-breakpoint
CREATE TABLE "festivals" (
	"content_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"lon" double precision,
	"lat" double precision,
	"geom" geography(Point, 4326) GENERATED ALWAYS AS (CASE WHEN lon IS NULL OR lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography END) STORED,
	"region_code" text,
	"addr" text,
	"image_url" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_prices" (
	"day" date NOT NULL,
	"area" text NOT NULL,
	"product" text NOT NULL,
	"price" double precision NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "fuel_prices_day_area_product_pk" PRIMARY KEY("day","area","product")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"checkpoint" jsonb,
	"stats" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pois" (
	"content_id" text PRIMARY KEY NOT NULL,
	"content_type_id" integer NOT NULL,
	"title" text NOT NULL,
	"addr" text,
	"lon" double precision,
	"lat" double precision,
	"geom" geography(Point, 4326) GENERATED ALWAYS AS (CASE WHEN lon IS NULL OR lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography END) STORED,
	"region_code" text,
	"image_url" text,
	"pet_allowed" boolean,
	"pet_info" jsonb,
	"modified_time" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"code" text PRIMARY KEY NOT NULL,
	"regn_cd" text NOT NULL,
	"signgu_cd" text NOT NULL,
	"sido_name" text NOT NULL,
	"name" text NOT NULL,
	"lon" double precision,
	"lat" double precision,
	"geom" geography(Point, 4326) GENERATED ALWAYS AS (CASE WHEN lon IS NULL OR lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography END) STORED,
	"is_candidate" boolean DEFAULT false NOT NULL,
	"excluded_reason" text,
	"type_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_ratio" double precision DEFAULT 0 NOT NULL,
	"pet_count" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "api_cache_expires_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "festivals_region_dates_idx" ON "festivals" USING btree ("region_code","start_date","end_date");--> statement-breakpoint
CREATE INDEX "pois_region_type_idx" ON "pois" USING btree ("region_code","content_type_id");--> statement-breakpoint
CREATE INDEX "regions_geom_gist" ON "regions" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "pois_geom_gist" ON "pois" USING gist ("geom");
