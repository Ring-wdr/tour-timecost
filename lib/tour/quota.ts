import { config } from "@/lib/config";
import { addUsage, getUsage } from "@/lib/usage";
import type { TourClient } from "./client";

export class QuotaStop extends Error {}

/**
 * live 호출 전 남은 일일 호출 수를 확인하고 사용량을 기록한다.
 * mock은 쿼터를 쓰지 않으므로 기록하지 않는다.
 */
let callsThisRun = 0;
/** 실행당 호출 상한 (INGEST_MAX_CALLS). 쿼터 분할·체크포인트 재개 확인용 */
const maxCallsPerRun = Number(process.env.INGEST_MAX_CALLS || Infinity);

export async function tourCall<T>(client: TourClient, label: string, fn: () => Promise<T>): Promise<T> {
  if (++callsThisRun > maxCallsPerRun) throw new QuotaStop(`실행당 호출 상한 ${maxCallsPerRun}건 도달`);
  if (client.source === "live") {
    const used = await getUsage("tour");
    const stopAt = Math.floor(config.tour.dailyLimit * config.tour.stopRatio);
    if (used >= stopAt) throw new QuotaStop(`TourAPI 오늘 ${used}/${config.tour.dailyLimit}건 사용 (중단 기준 ${stopAt})`);
    const now = await addUsage("tour");
    console.log(`[tour] ${label} (오늘 ${now}건째, 남은 ${config.tour.dailyLimit - now}건)`);
    await new Promise((r) => setTimeout(r, config.tour.requestDelayMs));
  }
  return fn();
}
