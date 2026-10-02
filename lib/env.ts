import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/trip"),
  TOUR_API_KEY: z.string().optional(),
  TOUR_MOCK: z.string().optional(),
  KAKAO_REST_KEY: z.string().optional(),
  OPINET_KEY: z.string().optional(),
  TAGO_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const blankToUndefined = (v: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === "" ? undefined : val]));

export const env = schema.parse(blankToUndefined(process.env));

export const isTourMock = () => !env.TOUR_API_KEY || env.TOUR_MOCK === "1";
export const isKakaoMock = () => !env.KAKAO_REST_KEY;
