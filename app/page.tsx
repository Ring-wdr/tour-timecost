import { DataNotice } from "@/components/DataNotice";
import { SearchForm } from "@/components/SearchForm";
import { upcomingSaturday } from "@/lib/compare-input";
import { config } from "@/lib/config";
import { env } from "@/lib/env";
import { latestGasolinePrice } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const fuel = await latestGasolinePrice().catch(() => null);
  return (
    <>
      <DataNotice />
      <h1>이번 주말, 예산 안에서 어디가 제일 나을까?</h1>
      <p className="muted">
        출발지·날짜·예산을 넣으면 전국 시군구를 <b>예상 이동시간, 예상 총비용, 볼거리</b>로 비교해 순위를 보여줍니다.
        일정을 짜 주는 서비스가 아니라 <b>목적지를 고르는 단계</b>의 비교 도구입니다.
      </p>
      <SearchForm
        defaultDate={upcomingSaturday()}
        geocodeEnabled={!!env.KAKAO_REST_KEY}
        defaults={{
          fuelEfficiency: config.defaults.fuelEfficiencyKmPerL,
          fuelPrice: fuel?.price ?? config.defaults.fuelPricePerLiter,
          fuelPriceSource: fuel ? `오피넷 ${fuel.day}` : "설정 기본값",
          lodging: config.defaults.lodgingPerNight,
          dailySpend: config.defaults.dailySpendPerPerson,
          minKm: config.search.minOneWayKm,
          maxKm: { ...config.search.maxOneWayKm },
        }}
      />
    </>
  );
}
