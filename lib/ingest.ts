import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type RunStatus = "running" | "done" | "paused" | "failed";

/** 같은 job의 마지막 paused 실행 체크포인트 */
export async function lastCheckpoint<T>(job: string): Promise<T | null> {
  const rows = await db
    .select()
    .from(schema.ingestRuns)
    .where(eq(schema.ingestRuns.job, job))
    .orderBy(desc(schema.ingestRuns.id))
    .limit(1);
  const last = rows[0];
  return last && last.status === "paused" ? (last.checkpoint as T) : null;
}

export async function startRun(job: string, source: "live" | "mock") {
  // 비정상 종료로 running에 남은 실행은 failed 처리
  await db
    .update(schema.ingestRuns)
    .set({ status: "failed", error: "중단됨(다음 실행에서 정리)", finishedAt: sql`now()` })
    .where(and(eq(schema.ingestRuns.job, job), eq(schema.ingestRuns.status, "running")));
  const [row] = await db.insert(schema.ingestRuns).values({ job, status: "running", source }).returning({ id: schema.ingestRuns.id });
  return row!.id;
}

export async function finishRun(id: number, status: RunStatus, fields: { checkpoint?: unknown; stats?: unknown; error?: string } = {}) {
  await db
    .update(schema.ingestRuns)
    .set({ status, checkpoint: fields.checkpoint ?? null, stats: fields.stats ?? null, error: fields.error ?? null, finishedAt: sql`now()` })
    .where(eq(schema.ingestRuns.id, id));
}

export async function lastSuccessfulRuns() {
  return db.execute<{ job: string; finished_at: string; source: string }>(sql`
    SELECT DISTINCT ON (job) job, finished_at, source FROM ingest_runs WHERE status = 'done' ORDER BY job, id DESC
  `);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** DB에 들어 있는 관광 데이터의 출처 (마지막 성공 적재 기준). 적재 전이면 null */
export async function tourDataSource(): Promise<"live" | "mock" | null> {
  const rows = await db.execute<{ source: "live" | "mock" }>(
    sql`SELECT source FROM ingest_runs WHERE job = 'tour' AND status = 'done' ORDER BY id DESC LIMIT 1`,
  );
  return rows[0]?.source ?? null;
}
