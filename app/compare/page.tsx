import Link from "next/link";
import { ContributionBar } from "@/components/ContributionBar";
import { DataNotice } from "@/components/DataNotice";
import { Estimate } from "@/components/Estimate";
import { runCompare } from "@/lib/compare";
import { inputToSearchParams, searchParamsToInput, toURLSearchParams, TYPE_LABEL, type CompareInput } from "@/lib/compare-input";
import { costTip, timeTip } from "@/lib/explain";
import { duration, km, won, ymd } from "@/lib/format";
import { topPlaces } from "@/lib/places";


export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = toURLSearchParams(await searchParams);
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  let input: CompareInput;
  try {
    input = searchParamsToInput(sp);
  } catch {
    return <p className="card">검색 조건이 올바르지 않습니다. <Link href="/">다시 검색</Link></p>;
  }
  const result = await runCompare(input);
  const rankOf = new Map(result.candidates.map((c, i) => [c.code, i + 1]));
  const cols = ids.map((id) => result.candidates.find((c) => c.code === id)).filter((c) => c !== undefined);
  const back = `/results?${inputToSearchParams(input)}`;
  if (cols.length < 2) {
    return (
      <p className="card">
        비교하려면 2~4곳을 골라야 합니다. <Link href={back}>결과 목록으로</Link>
      </p>
    );
  }
  const places = await topPlaces(cols.map((c) => c.code));
  const a = result.assumptions;
  const types = ["12", "14", "28", "39", "32"];

  return (
    <>
      <DataNotice />
      <h1>나란히 비교 ({cols.length}곳)</h1>
      <p className="small muted">
        <Link href={back}>← 결과 목록</Link> · {input.origin.label ?? "출발지"} 출발 · {a.tripDates.join(" ~ ")} · 모든 시간·비용은 추정
      </p>
      <div className="table-scroll">
        <table className="cmp">
          <caption className="sr-only">선택한 시군구 비교표</caption>
          <thead>
            <tr>
              <td />
              {cols.map((c) => (
                <th key={c.code} scope="col">
                  <Link href={`/regions/${c.code}`}>{c.sidoName} {c.name}</Link>
                  {c.cost.overBudget && <> <span className="badge danger">예산 초과</span></>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">순위·점수</th>
              {cols.map((c) => (
                <td key={c.code}>
                  {rankOf.get(c.code)}위 / {result.candidates.length}곳 · {c.score.score.toFixed(2)}
                  <ContributionBar c={c} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">편도 이동</th>
              {cols.map((c) => (
                <td key={c.code}>
                  {duration(c.route.durationS)} · {km(c.route.distanceKm)} <Estimate tip={timeTip(c)} />
                  {c.weekend && <div className="small">토 09시 출발 {duration(c.weekend.durationS)}</div>}
                </td>
              ))}
            </tr>
            {(
              [
                ["연료비", (c: (typeof cols)[number]) => won(c.cost.fuel)],
                ["통행료(왕복)", (c: (typeof cols)[number]) => (c.cost.toll === null ? "미계산" : won(c.cost.toll))],
                ...(input.tripType === "overnight"
                  ? ([[`숙박 (${a.lodgingSource === "user" ? "입력값" : "기본값"})`, (c: (typeof cols)[number]) => won(c.cost.lodging)]] as const)
                  : []),
                [`식비·입장료 (${a.dailySpendSource === "user" ? "입력값" : "기본값"})`, (c: (typeof cols)[number]) => won(c.cost.food)],
              ] as const
            ).map(([label, f]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cols.map((c) => <td key={c.code}>{f(c)}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row">총비용</th>
              {cols.map((c) => (
                <td key={c.code}>
                  <b>{won(c.cost.total)}{c.cost.totalIsLowerBound && "+"}</b> <Estimate tip={costTip(c, a)} />
                </td>
              ))}
            </tr>
            {types.map((t) => (
              <tr key={t}>
                <th scope="row">{TYPE_LABEL[t]} 수</th>
                {cols.map((c) => <td key={c.code}>{c.poi.typeCounts[t] ?? 0}</td>)}
              </tr>
            ))}
            {input.pet && (
              <tr>
                <th scope="row">반려동물 동반 가능</th>
                {cols.map((c) => <td key={c.code}>{c.poi.petCount}곳 <span className="small muted">(수집된 장소 기준)</span></td>)}
              </tr>
            )}
            <tr>
              <th scope="row">일정 중 축제</th>
              {cols.map((c) => (
                <td key={c.code}>
                  {c.festivals.length ? (
                    <ul>{c.festivals.map((f) => <li key={f.contentId}>{f.title} ({ymd(f.startDate)}~{ymd(f.endDate)}){f.longRunning && <span className="small muted"> · 장기 행사</span>}</li>)}</ul>
                  ) : (
                    <span className="muted">없음</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">대표 장소</th>
              {cols.map((c) => (
                <td key={c.code}>
                  <ul>{(places.get(c.code) ?? []).map((p) => <li key={p.content_id}>{p.title}</li>)}</ul>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">장소·축제 정보 출처: 한국관광공사 TourAPI. 대표 장소는 인기 순위가 아니라 이미지 보유 우선의 단순 규칙입니다.</p>
    </>
  );
}
