import type { Candidate } from "@/lib/compare";

export function ContributionBar({ c }: { c: Candidate }) {
  const p = c.score.parts;
  const seg = (v: number, color: string, label: string) =>
    v > 0 ? <span style={{ width: `${(v / 1.1) * 100}%`, background: `var(${color})` }} title={`${label} ${v.toFixed(2)}`} /> : null;
  return (
    <>
      <div className="bar" role="img" aria-label={`점수 기여도: 시간 ${p.time.toFixed(2)}, 비용 ${p.cost.toFixed(2)}, 볼거리 ${p.poi.toFixed(2)}${p.festival ? `, 축제 ${p.festival}` : ""}`}>
        {seg(p.time, "--c-time", "시간")}
        {seg(p.cost, "--c-cost", "비용")}
        {seg(p.poi, "--c-poi", "볼거리")}
        {seg(p.festival, "--c-fest", "축제")}
      </div>
      <div className="legend" aria-hidden>
        <span><i style={{ background: "var(--c-time)" }} />시간 {p.time.toFixed(2)}</span>
        <span><i style={{ background: "var(--c-cost)" }} />비용 {p.cost.toFixed(2)}</span>
        <span><i style={{ background: "var(--c-poi)" }} />볼거리 {p.poi.toFixed(2)}</span>
        {p.festival > 0 && <span><i style={{ background: "var(--c-fest)" }} />축제 {p.festival}</span>}
      </div>
    </>
  );
}
