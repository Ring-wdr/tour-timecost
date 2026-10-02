"use client";

import { useEffect, useRef, useState } from "react";
import { KAKAO_JS_KEY, loadKakaoMaps } from "@/lib/kakao-map";

interface Item {
  code: string;
  name: string;
  lon: number;
  lat: number;
  rank: number;
}
interface Props {
  origin: { lon: number; lat: number };
  items: Item[];
  selected: string | null;
  onSelect: (code: string) => void;
}

export function ResultMap(props: Props) {
  const [failed, setFailed] = useState(!KAKAO_JS_KEY);
  return failed ? <SvgMap {...props} /> : <KakaoMap {...props} onFail={() => setFailed(true)} />;
}

function markerEl(item: Item, selected: boolean, onSelect: (code: string) => void) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = String(item.rank);
  el.title = item.name;
  el.setAttribute("aria-label", `${item.rank}위 ${item.name}`);
  el.style.cssText = `width:${selected ? 30 : 24}px;height:${selected ? 30 : 24}px;border-radius:50%;padding:0;font-size:12px;font-weight:700;border:2px solid #fff;color:#fff;cursor:pointer;background:${selected ? "#b0379a" : "#0b6e4f"};box-shadow:0 1px 3px rgba(0,0,0,.4)`;
  el.onclick = () => onSelect(item.code);
  return el;
}

function KakaoMap({ origin, items, selected, onSelect, onFail }: Props & { onFail: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const overlays = useRef<{ setMap(m: unknown): void }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !ref.current) return;
        mapRef.current = new maps.Map(ref.current, { center: new maps.LatLng(origin.lat, origin.lon), level: 12 });
        setReady(true);
      })
      .catch(onFail);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const map = mapRef.current as { setBounds(b: unknown): void } | null;
    if (!ready || !maps || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    const bounds = new maps.LatLngBounds();
    const o = new maps.LatLng(origin.lat, origin.lon);
    bounds.extend(o);
    overlays.current = [new maps.Marker({ position: o, map, title: "출발지" })];
    for (const it of items) {
      const p = new maps.LatLng(it.lat, it.lon);
      bounds.extend(p);
      overlays.current.push(
        new maps.CustomOverlay({ position: p, content: markerEl(it, it.code === selected, onSelect), map, zIndex: it.code === selected ? 10 : 1 }),
      );
    }
    map.setBounds(bounds);
    // selected 변경 시에는 bounds를 다시 맞추지 않도록 items 기준으로만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items, selected]);

  return <div ref={ref} className="map-box" />;
}

/** 지도 키가 없을 때: 좌표를 단순 투영한 SVG (보조 수단, 목록이 주 UI) */
function SvgMap({ origin, items, selected, onSelect }: Props) {
  const pts = [origin, ...items];
  const minLon = Math.min(...pts.map((p) => p.lon)) - 0.3;
  const maxLon = Math.max(...pts.map((p) => p.lon)) + 0.3;
  const minLat = Math.min(...pts.map((p) => p.lat)) - 0.3;
  const maxLat = Math.max(...pts.map((p) => p.lat)) + 0.3;
  const W = 400;
  // 위도 1도 ≈ 경도 1.25도(한국 위도) 비율 보정
  const H = Math.min(600, Math.max(260, (W * ((maxLat - minLat) * 1.25)) / (maxLon - minLon)));
  const x = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  return (
    <div className="map-box" style={{ height: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="후보 위치 개략도 (출발지 기준)">
        <rect width={W} height={H} fill="var(--bg)" />
        <circle cx={x(origin.lon)} cy={y(origin.lat)} r={7} fill="var(--c-time)" />
        <text x={x(origin.lon) + 10} y={y(origin.lat) + 4} fontSize="12" fill="var(--text)">출발</text>
        {[...items].reverse().map((it) => {
          const sel = it.code === selected;
          return (
            <g key={it.code} onClick={() => onSelect(it.code)} style={{ cursor: "pointer" }}>
              <title>{`${it.rank}위 ${it.name}`}</title>
              <circle cx={x(it.lon)} cy={y(it.lat)} r={sel ? 11 : 8} fill={sel ? "var(--c-fest)" : "var(--accent)"} stroke="var(--surface)" strokeWidth={1.5} />
              <text x={x(it.lon)} y={y(it.lat) + 4} fontSize="10" textAnchor="middle" fill="#fff" fontWeight={700}>{it.rank}</text>
              {sel && <text x={x(it.lon) + 14} y={y(it.lat) + 4} fontSize="12" fill="var(--text)" fontWeight={600}>{it.name}</text>}
            </g>
          );
        })}
      </svg>
      <p className="small muted" style={{ margin: "4px 8px" }}>카카오 지도 키가 없어 개략도로 표시합니다.</p>
    </div>
  );
}
