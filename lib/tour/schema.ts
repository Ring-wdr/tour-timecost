import { z } from "zod";

/**
 * TourAPI 4.0 (KorService2) 응답 스키마.
 * 필드 이름은 공개 문서 기준이며 실측 전까지 docs/api-notes.md에 "미확인"으로 남겨 둔다.
 * 알려진 함정: 0건이면 items가 "" (빈 문자열), 1건이면 item이 배열이 아닌 객체.
 */

const str = z.union([z.string(), z.number()]).transform((v) => String(v));
const optStr = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : String(v)));

export function envelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    response: z.object({
      header: z.object({ resultCode: str, resultMsg: z.string().optional() }),
      body: z
        .object({
          items: z.union([
            z.literal(""),
            z.null(),
            z.object({ item: z.union([z.array(item), item]).optional() }),
          ]),
          numOfRows: z.coerce.number().optional(),
          pageNo: z.coerce.number().optional(),
          totalCount: z.coerce.number(),
        })
        .optional(),
    }),
  });
}

/** items 형태(빈 문자열 / 단일 객체 / 배열)를 항상 배열로 정규화 */
export function normalizeItems<T>(items: "" | null | { item?: T | T[] } | undefined): T[] {
  if (!items || typeof items !== "object" || items.item === undefined) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

export const ldongItem = z.object({
  lDongRegnCd: str,
  lDongRegnNm: z.string(),
  lDongSignguCd: str,
  lDongSignguNm: z.string(),
});
export type LdongItem = z.infer<typeof ldongItem>;

export const areaItem = z
  .object({
    contentid: str,
    contenttypeid: str,
    title: z.string(),
    addr1: optStr,
    addr2: optStr,
    mapx: optStr,
    mapy: optStr,
    firstimage: optStr,
    firstimage2: optStr,
    lDongRegnCd: optStr,
    lDongSignguCd: optStr,
    modifiedtime: optStr,
  })
  .passthrough();
export type AreaItem = z.infer<typeof areaItem>;

export const festivalItem = areaItem.extend({
  eventstartdate: str,
  eventenddate: str,
});
export type FestivalItem = z.infer<typeof festivalItem>;

export const petItem = z
  .object({
    contentid: str,
    acmpyTypeCd: optStr,
    acmpyPsblCpam: optStr,
    acmpyNeedMtr: optStr,
  })
  .passthrough();
export type PetItem = z.infer<typeof petItem>;

/** 좌표 문자열 → 숫자. 0이나 한국 범위 밖이면 null */
export function parseCoord(mapx?: string, mapy?: string): { lon: number; lat: number } | null {
  const lon = Number(mapx);
  const lat = Number(mapy);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < 124 || lon > 132 || lat < 33 || lat > 39) return null;
  return { lon, lat };
}

/** 반려동물 동반 구분 텍스트 → 가능 여부. 코드 체계 미확인이라 보수적으로 해석 */
export function parsePetAllowed(item: PetItem | undefined): boolean | null {
  if (!item) return null;
  const t = item.acmpyTypeCd;
  if (!t) return null;
  if (/불가/.test(t)) return false;
  return /가능|동반/.test(t);
}

export function regionCodeOf(item: { lDongRegnCd?: string; lDongSignguCd?: string }): string | null {
  if (!item.lDongRegnCd || !item.lDongSignguCd) return null;
  return `${item.lDongRegnCd}${item.lDongSignguCd}`;
}

/** YYYYMMDD → YYYY-MM-DD */
export function ymdToIso(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}
export function isoToYmd(v: string): string {
  return v.replaceAll("-", "");
}
