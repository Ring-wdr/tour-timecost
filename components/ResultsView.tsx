"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Estimate } from "@/components/Estimate";
import { ResultMap } from "@/components/ResultMap";
import type { CompareResult } from "@/lib/compare";
import { inputToSearchParams, PREF_LABEL, type CompareInput } from "@/lib/compare-input";
import { duration, won, ymd } from "@/lib/format";
import { costTip, SOURCE_LABEL, timeTip } from "@/lib/explain";
import { ContributionBar } from "@/components/ContributionBar";
import { normalizeWeights, scoreCandidates, type Weights } from "@/lib/scoring";

export function ResultsView({ result, input }: { result: CompareResult; input: CompareInput }) {
  const [weights, setWeights] = useState<Weights>(input.weights);
  const [showOver, setShowOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const w = normalizeWeights(weights);
  const ranked = useMemo(() => {
    const scored = scoreCandidates(
      result.candidates.map((c) => ({ id: c.code, ...c.scoreInput })),
      weights,
      { festivalBonus: result.assumptions.festivalBonus },
    );
    const byId = new Map(result.candidates.map((c) => [c.code, c]));
    return scored.map((s) => ({ ...byId.get(s.id)!, score: s }));
  }, [result, weights]);

  const visible = ranked.filter((c) => showOver || !c.cost.overBudget);
  const overCount = ranked.filter((c) => c.cost.overBudget).length;

  function changeWeight(k: keyof Weights, v: number) {
    const next = { ...weights, [k]: v };
    setWeights(next);
    // 서버 재호출 없이 URL만 갱신 (새로고침·공유 시 유지)
    const sp = inputToSearchParams({ ...input, weights: next });
    window.history.replaceState(null, "", `?${sp}`);
  }

  function togglePick(code: string) {
    setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : p.length >= 4 ? p : [...p, code]));
  }

  const compareHref = `/compare?${inputToSearchParams({ ...input, weights })}&ids=${picked.join(",")}`;
  const a = result.assumptions;

  return (
    <>
      <section className="card controls" aria-labelledby="ctl-title">
        <h2 id="ctl-title" style={{ margin: 0 }}>가중치 <span className="small muted">— 움직이면 바로 다시 정렬됩니다</span></h2>
        <div className="sliders">
          {(
            [
              ["time", "이동시간", "--c-time"],
              ["cost", "비용", "--c-cost"],
              ["poi", "볼거리", "--c-poi"],
            ] as const
          ).map(([k, label, color]) => (
            <div key={k}>
              <label htmlFor={`w-${k}`}>
                <i style={{ display: "inline-block", width: 10, height: 10, background: `var(${color})`, borderRadius: 2, marginRight: 6 }} />
                {label} <span className="muted">{Math.round(w[k] * 100)}%</span>
              </label>
              <input
                id={`w-${k}`}
                type="range"
                min={0}
                max={10}
                step={1}
                value={Math.round(weights[k] * 10)}
                onChange={(e) => changeWeight(k, Number(e.target.value) / 10)}
              />
            </div>
          ))}
        </div>
        <div className="row small">
          <label className="row" style={{ margin: 0, fontWeight: 400 }}>
            <input type="checkbox" checked={showOver} onChange={(e) => setShowOver(e.target.checked)} /> 예산 초과 {overCount}곳도 보기
          </label>
          <span className="muted">
            선호: {input.prefs.length ? input.prefs.map((p) => PREF_LABEL[p]).join(", ") : "지정 안 함(관광지·문화·레포츠)"}
            {input.pet && " · 반려동물 동반"}
          </span>
        </div>
      </section>

      <div className="results-layout">
        <section aria-labelledby="list-title">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="list-title" style={{ margin: "0 0 8px" }}>
              예산 안 {ranked.length - overCount}곳 {showOver && `(+ 초과 ${overCount}곳)`}
            </h2>
            <div className="row">
              <span className="small muted" aria-live="polite">비교 선택 {picked.length}/4</span>
              {picked.length >= 2 ? (
                <Link className="btn" href={compareHref}>나란히 비교</Link>
              ) : (
                <button type="button" disabled title="2~4곳을 선택하세요">나란히 비교</button>
              )}
            </div>
          </div>
          {visible.length === 0 && (
            <p className="card">
              조건에 맞는 곳이 없습니다. 예산을 늘리거나 &quot;예산 초과도 보기&quot;를 켜 보세요.
            </p>
          )}
          <ol className="results">
            {visible.map((c, i) => (
              <li
                key={c.code}
                className={`card result${selected === c.code ? " selected" : ""}`}
                onMouseEnter={() => setSelected(c.code)}
                onFocus={() => setSelected(c.code)}
              >
                <div className="rank" aria-label={`${i + 1}위`}>{i + 1}</div>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div className="noimg" aria-hidden>이미지 없음</div>
                )}
                <div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h3>
                      <Link href={`/regions/${c.code}`}>{c.sidoName} {c.name}</Link>
                    </h3>
                    <label className="row small" style={{ margin: 0, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={picked.includes(c.code)}
                        disabled={!picked.includes(c.code) && picked.length >= 4}
                        onChange={() => togglePick(c.code)}
                      />
                      비교에 담기
                    </label>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {c.cost.overBudget && <span className="badge danger">예산 초과</span>}
                    {c.festivals.length > 0 && (
                      <span className="badge fest" title={c.festivals.map((f) => f.title).join(", ")}>
                        축제 {c.festivals.length}건 진행
                      </span>
                    )}
                    {c.route.stale && <span className="badge warn">최신 아님</span>}
                    {c.route.source !== "live" && <span className="badge warn">경로 {SOURCE_LABEL[c.route.source]}</span>}
                    {input.pet && <span className="badge">반려동물 동반 가능 {c.poi.petCount}곳</span>}
                  </div>
                  <div className="facts">
                    <span>
                      편도 <b>{duration(c.route.durationS)}</b>
                      <Estimate tip={timeTip(c)} />
                    </span>
                    {c.weekend && (
                      <span>
                        토 09시 출발 <b>{duration(c.weekend.durationS)}</b>
                        <Estimate tip="미래 운행 정보(출발 시각 기준) — 점수 상위 10곳만 조회" />
                      </span>
                    )}
                    <span>
                      총 <b>{won(c.cost.total)}</b>
                      {c.cost.totalIsLowerBound && "+"}
                      <Estimate tip={costTip(c, a)} />
                    </span>
                    <span>점수 <b>{c.score.score.toFixed(2)}</b></span>
                  </div>
                  <ContributionBar c={c} />
                  <details className="breakdown">
                    <summary>비용 내역·왜 이 순위인지</summary>
                    <table>
                      <tbody>
                        <tr><td>연료비</td><td>{won(c.cost.fuel)}</td></tr>
                        <tr><td>통행료(왕복)</td><td>{c.cost.toll === null ? "미계산" : won(c.cost.toll)}</td></tr>
                        {c.cost.nights > 0 && <tr><td>숙박 ({a.lodgingSource === "user" ? "입력값" : "기본값"})</td><td>{won(c.cost.lodging)}</td></tr>}
                        <tr><td>식비·입장료 ({a.dailySpendSource === "user" ? "입력값" : "기본값"})</td><td>{won(c.cost.food)}</td></tr>
                        <tr><td>시간 점수</td><td>{c.score.normalized.time.toFixed(2)} × {w.time.toFixed(2)} = {c.score.parts.time.toFixed(3)}</td></tr>
                        <tr><td>비용 점수</td><td>{c.score.normalized.cost.toFixed(2)} × {w.cost.toFixed(2)} = {c.score.parts.cost.toFixed(3)}</td></tr>
                        <tr><td>볼거리 점수</td><td>{c.score.normalized.poi.toFixed(2)} × {w.poi.toFixed(2)} = {c.score.parts.poi.toFixed(3)} <span className="muted">(선호 장소 {c.scoreInput.poiCount}곳)</span></td></tr>
                        {c.score.parts.festival > 0 && <tr><td>축제 보너스</td><td>+{c.score.parts.festival}</td></tr>}
                      </tbody>
                    </table>
                    {c.festivals.length > 0 && (
                      <p className="small">축제: {c.festivals.map((f) => `${f.title} (${ymd(f.startDate)}~${ymd(f.endDate)})`).join(", ")}</p>
                    )}
                  </details>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className="map-col" aria-label="지도">
          <ResultMap
            origin={input.origin}
            items={visible.slice(0, 30).map((c, i) => ({ code: c.code, name: c.name, lon: c.lon, lat: c.lat, rank: i + 1 }))}
            selected={selected}
            onSelect={setSelected}
          />
          <p className="small muted">상위 30곳 표시. 지도 없이도 왼쪽 목록만으로 모든 기능을 쓸 수 있습니다.</p>
        </aside>
      </div>
    </>
  );
}
