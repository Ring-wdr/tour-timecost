import Link from "next/link";
import { DataNotice } from "@/components/DataNotice";
import { ResultsView } from "@/components/ResultsView";
import { runCompare } from "@/lib/compare";
import { searchParamsToInput, toURLSearchParams, type CompareInput } from "@/lib/compare-input";
import { won } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let input: CompareInput;
  try {
    input = searchParamsToInput(toURLSearchParams(await searchParams));
  } catch {
    return (
      <p className="card">
        검색 조건이 올바르지 않습니다. <Link href="/">처음부터 다시 검색</Link>해 주세요.
      </p>
    );
  }
  const result = await runCompare(input);
  const a = result.assumptions;
  return (
    <>
      <DataNotice />
      <h1>
        {input.origin.label || `(${input.origin.lat.toFixed(3)}, ${input.origin.lon.toFixed(3)})`} 출발 ·{" "}
        {input.tripType === "daytrip" ? "당일치기" : "1박 2일"} · {input.people}명 · 예산 {won(input.budget)}
      </h1>
      <p className="small muted">
        {a.tripDates.join(" ~ ")} · 직선 {a.minOneWayKm}~{a.maxOneWayKm}km 후보{result.excluded.tooClose > 0 && ` (가까운 ${result.excluded.tooClose}곳 제외)`} · 유가 {a.fuelPricePerLiter.toLocaleString()}원/L(
        {{ user: "입력값", opinet: "오피넷", default: "기본값" }[a.fuelPriceSource]}) · 연비 {a.fuelEfficiencyKmPerL}km/L
        {result.excluded.unreachable.length > 0 && <> · 자동차로 갈 수 없는 곳 제외: {result.excluded.unreachable.join(", ")}</>}
        {" · "}
        {result.fromCache ? "캐시된 결과(10분)" : "새로 계산"}
        {result.stale && <> · <span className="badge warn">일부 최신 아님</span></>}
        {" · "}<Link href="/">조건 바꾸기</Link>
      </p>
      <ResultsView result={result} input={input} />
    </>
  );
}
