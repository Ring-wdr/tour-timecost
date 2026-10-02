import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** 키 순서와 무관한 JSON 직렬화 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function cacheKey(namespace: string, params: unknown): string {
  return `${namespace}:${createHash("sha256").update(stableStringify(params)).digest("hex").slice(0, 32)}`;
}

export interface CacheHit<T> {
  value: T;
  stale: boolean;
  createdAt: Date;
}

/** allowStale면 만료된 값도 돌려준다 (외부 장애 시 "최신 아님" 응답용) */
export async function getCache<T>(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit<T> | null> {
  const rows = await db.select().from(schema.apiCache).where(eq(schema.apiCache.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const stale = row.expiresAt.getTime() < Date.now();
  if (stale && !opts.allowStale) return null;
  return { value: row.value as T, stale, createdAt: row.createdAt };
}

export async function getManyCache<T>(keys: string[], opts: { allowStale?: boolean } = {}): Promise<Map<string, CacheHit<T>>> {
  const out = new Map<string, CacheHit<T>>();
  if (!keys.length) return out;
  const rows = await db.execute<{ key: string; value: T; created_at: string; expires_at: string }>(
    sql`SELECT key, value, created_at, expires_at FROM api_cache WHERE key IN ${keys}`,
  );
  for (const r of rows) {
    const stale = new Date(r.expires_at).getTime() < Date.now();
    if (stale && !opts.allowStale) continue;
    out.set(r.key, { value: r.value, stale, createdAt: new Date(r.created_at) });
  }
  return out;
}

export async function setCache(key: string, namespace: string, value: unknown, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db
    .insert(schema.apiCache)
    .values({ key, namespace, value, expiresAt })
    .onConflictDoUpdate({ target: schema.apiCache.key, set: { value, expiresAt, createdAt: sql`now()` } });
}
