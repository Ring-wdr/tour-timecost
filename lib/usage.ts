import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** 쿼터 집계 기준일: 한국 시간 */
export function kstDay(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function getUsage(api: string, day = kstDay()): Promise<number> {
  const rows = await db
    .select({ count: schema.apiUsage.count })
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.day, day), eq(schema.apiUsage.api, api)));
  return rows[0]?.count ?? 0;
}

export async function addUsage(api: string, n = 1, day = kstDay()): Promise<number> {
  const rows = await db
    .insert(schema.apiUsage)
    .values({ day, api, count: n })
    .onConflictDoUpdate({
      target: [schema.apiUsage.day, schema.apiUsage.api],
      set: { count: sql`${schema.apiUsage.count} + ${n}` },
    })
    .returning({ count: schema.apiUsage.count });
  return rows[0]!.count;
}

export async function usageToday(day = kstDay()) {
  const rows = await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.day, day));
  return Object.fromEntries(rows.map((r) => [r.api, r.count]));
}
