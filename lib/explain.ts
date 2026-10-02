import type { Candidate, CompareResult } from "@/lib/compare";
import { config } from "@/lib/config";
import { km, won } from "@/lib/format";

export function sourceLabel(r: Candidate["route"]): string {
  if (r.source === "live") return "카카오 길찾기";
  if (r.source === "mock") return "mock 경로";
  return r.calibrated ? "보정 추정" : "직선거리 추정";
}

export function costTip(c: Candidate, a: CompareResult["assumptions"]): string {
  const lines = [
    `연료 ${won(c.cost.fuel)} = 왕복 ${km(c.route.distanceKm * 2)} × ${a.fuelPricePerLiter.toLocaleString()}원/L ÷ ${a.fuelEfficiencyKmPerL}km/L`,
    c.cost.toll === null ? `통행료 미계산 (예비 점수 상위 ${config.kakao.routeTopN}곳만 길찾기 조회)` : `통행료 왕복 ${won(c.cost.toll)}`,
  ];
  if (c.cost.nights) lines.push(`숙박 ${won(c.cost.lodging)} = 1박 ${a.lodgingSource === "user" ? "입력값" : "기본값"} (가격 데이터 없음)`);
  lines.push(`식비·입장료 ${won(c.cost.food)} = 1인 1일 ${won(a.dailySpendPerPerson)} (${a.dailySpendSource === "user" ? "입력값" : "기본값"}) × 인원 × ${c.cost.days}일`);
  return lines.join("\n");
}

export function timeTip(c: Candidate): string {
  const r = c.route;
  const why =
    r.source === "estimate"
      ? r.calibrated
        ? `직선 ${km(c.straightKm)} 기반 추정을 이번 출발지 실측 경로들의 비율로 보정`
        : `직선 ${km(c.straightKm)} × 1.3, 평균 속도 기반 추정`
      : r.source === "mock"
        ? "카카오 키 없음 — 직선거리 기반 mock 경로"
        : "카카오모빌리티 자동차 길찾기";
  return `편도 ${km(r.distanceKm)} · ${why}${r.stale ? "\n(외부 API 장애로 이전 캐시 사용, 최신 아님)" : ""}`;
}
