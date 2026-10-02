"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PREFS, PREF_LABEL, compareInputSchema, inputToSearchParams, type Pref } from "@/lib/compare-input";
import { KAKAO_JS_KEY, loadKakaoMaps } from "@/lib/kakao-map";
import { ORIGIN_PRESETS } from "@/lib/origins";

interface Props {
  defaultDate: string;
  defaults: {
    fuelEfficiency: number;
    fuelPrice: number;
    fuelPriceSource: string;
    lodging: number;
    dailySpend: number;
    minKm: number;
    maxKm: { daytrip: number; overnight: number };
  };
  geocodeEnabled: boolean;
}

export function SearchForm({ defaultDate, defaults, geocodeEnabled }: Props) {
  const router = useRouter();
  const [origin, setOrigin] = useState<{ lon: number; lat: number; label: string }>({ ...ORIGIN_PRESETS[0] });
  const [query, setQuery] = useState("");
  const [geoResults, setGeoResults] = useState<{ label: string; lon: number; lat: number }[]>([]);
  const [geoMsg, setGeoMsg] = useState("");
  const [tripType, setTripType] = useState<"daytrip" | "overnight">("daytrip");
  const [error, setError] = useState("");

  async function searchAddress() {
    setGeoMsg("검색 중…");
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) return setGeoMsg(data.error ?? "검색 실패");
    setGeoResults(data.results);
    setGeoMsg(data.results.length ? `${data.results.length}건` : "결과 없음");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const optNum = (k: string) => (f.get(k) === "" || f.get(k) === null ? undefined : Number(f.get(k)));
    const parsed = compareInputSchema.safeParse({
      origin: { lon: origin.lon, lat: origin.lat, label: origin.label || undefined },
      date: f.get("date"),
      tripType,
      people: Number(f.get("people")),
      budget: Number(f.get("budget")),
      fuelEfficiency: Number(f.get("eff")),
      fuelPrice: optNum("fuel"),
      lodgingPerNight: tripType === "overnight" ? optNum("lodging") : undefined,
      dailySpendPerPerson: optNum("spend"),
      prefs: f.getAll("prefs") as Pref[],
      pet: f.get("pet") === "on",
      minOneWayKm: optNum("minkm"),
      maxOneWayKm: optNum("maxkm"),
    });
    if (!parsed.success) {
      setError("입력값을 확인해 주세요: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
      return;
    }
    router.push(`/results?${inputToSearchParams(parsed.data)}`);
  }

  return (
    <form className="search" onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend>출발지</legend>
        <div className="grid2">
          <div>
            <label htmlFor="preset">주요 출발지</label>
            <select
              id="preset"
              value={ORIGIN_PRESETS.find((p) => p.label === origin.label)?.label ?? ""}
              onChange={(e) => {
                const p = ORIGIN_PRESETS.find((x) => x.label === e.target.value);
                if (p) setOrigin({ ...p });
              }}
            >
              <option value="" disabled>직접 지정</option>
              {ORIGIN_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="addr">주소·장소 검색</label>
            <div className="row">
              <input
                id="addr"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (geocodeEnabled && query) void searchAddress();
                  }
                }}
                placeholder={geocodeEnabled ? "주소나 장소명 (예: 서울 마포구 월드컵로, 강릉역)" : "카카오 REST 키 설정 시 사용 가능"}
                disabled={!geocodeEnabled}
                className="grow"
              />
              <button type="button" className="secondary" onClick={searchAddress} disabled={!geocodeEnabled || !query}>
                검색
              </button>
            </div>
            <div className="hint" aria-live="polite">{geoMsg}</div>
            {geoResults.length > 0 && (
              <ul className="small">
                {geoResults.map((r) => (
                  <li key={r.label}>
                    <button type="button" className="secondary" style={{ padding: "2px 8px" }} onClick={() => { setOrigin(r); setGeoResults([]); setGeoMsg(`선택: ${r.label}`); }}>
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label htmlFor="lat">위도</label>
            <input id="lat" type="number" step="0.0001" value={origin.lat} onChange={(e) => setOrigin({ ...origin, lat: Number(e.target.value), label: "" })} />
          </div>
          <div>
            <label htmlFor="lon">경도</label>
            <input id="lon" type="number" step="0.0001" value={origin.lon} onChange={(e) => setOrigin({ ...origin, lon: Number(e.target.value), label: "" })} />
          </div>
        </div>
        {KAKAO_JS_KEY ? <OriginMap origin={origin} onPick={(lon, lat) => setOrigin({ lon, lat, label: "" })} /> : (
          <p className="hint">지도 클릭 선택은 카카오 지도 JS 키(NEXT_PUBLIC_KAKAO_JS_KEY) 설정 시 사용할 수 있습니다.</p>
        )}
        <p className="hint">현재 출발지: {origin.label || "직접 지정"} ({origin.lat.toFixed(4)}, {origin.lon.toFixed(4)}) — 캐시를 위해 약 1km 단위로 반올림해 계산합니다.</p>
      </fieldset>

      <fieldset>
        <legend>일정과 예산</legend>
        <div className="grid2">
          <div>
            <label htmlFor="date">출발 날짜</label>
            <input id="date" name="date" type="date" defaultValue={defaultDate} required />
            <div className="hint">기본값: 다가오는 토요일</div>
          </div>
          <div>
            <span id="trip-label" style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>일정</span>
            <div className="seg" role="radiogroup" aria-labelledby="trip-label">
              {(["daytrip", "overnight"] as const).map((t) => (
                <label key={t}>
                  <input type="radio" name="trip" value={t} checked={tripType === t} onChange={() => setTripType(t)} />
                  <span>{t === "daytrip" ? "당일치기" : "1박 2일"}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="people">인원</label>
            <input id="people" name="people" type="number" min={1} max={20} defaultValue={2} required />
          </div>
          <div>
            <label htmlFor="budget">총예산 (원)</label>
            <input id="budget" name="budget" type="number" min={0} step={10000} defaultValue={200000} required />
          </div>
          <div>
            <label htmlFor="minkm">편도 직선거리 최소·최대 (km)</label>
            <div className="row">
              <input id="minkm" name="minkm" type="number" min={0} max={300} className="grow" placeholder={String(defaults.minKm)} aria-label="최소 거리 km" />
              <span aria-hidden>~</span>
              <input id="maxkm" name="maxkm" type="number" min={10} max={600} className="grow" placeholder={String(tripType === "daytrip" ? defaults.maxKm.daytrip : defaults.maxKm.overnight)} aria-label="최대 거리 km" />
            </div>
            <div className="hint">비우면 {defaults.minKm}km ~ {tripType === "daytrip" ? `${defaults.maxKm.daytrip}km(당일)` : `${defaults.maxKm.overnight}km(1박)`}. 너무 가까운 곳은 제외</div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>비용 가정 (자가용)</legend>
        <div className="grid2">
          <div>
            <label htmlFor="eff">연비 (km/L)</label>
            <input id="eff" name="eff" type="number" min={1} step={0.5} defaultValue={defaults.fuelEfficiency} />
          </div>
          <div>
            <label htmlFor="fuel">유가 (원/L)</label>
            <input id="fuel" name="fuel" type="number" min={0} step={10} placeholder={`${defaults.fuelPrice} (${defaults.fuelPriceSource})`} />
            <div className="hint">비우면 {defaults.fuelPriceSource} {defaults.fuelPrice.toLocaleString()}원</div>
          </div>
          {tripType === "overnight" && (
            <div>
              <label htmlFor="lodging">1박 숙박 예산 (원)</label>
              <input id="lodging" name="lodging" type="number" min={0} step={10000} placeholder={String(defaults.lodging)} />
              <div className="hint">숙박 가격 데이터는 없습니다. 비우면 기본값 {defaults.lodging.toLocaleString()}원</div>
            </div>
          )}
          <div>
            <label htmlFor="spend">식비·입장료 (1인 1일, 원)</label>
            <input id="spend" name="spend" type="number" min={0} step={5000} placeholder={String(defaults.dailySpend)} />
            <div className="hint">비우면 기본값 {defaults.dailySpend.toLocaleString()}원</div>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>선호</legend>
        <div className="chips" role="group" aria-label="선호 유형 (여러 개 선택)">
          {PREFS.map((p) => (
            <label key={p} className="chip">
              <input type="checkbox" name="prefs" value={p} defaultChecked={p === "nature"} />
              <span>{PREF_LABEL[p]}</span>
            </label>
          ))}
          <label className="chip">
            <input type="checkbox" name="pet" />
            <span>🐾 반려동물 동반</span>
          </label>
        </div>
        <p className="hint">선택한 유형의 장소 수로 볼거리 점수를 매깁니다. 축제를 고르면 일정 중 진행하는 축제가 있는 곳에 보너스 0.1점.</p>
      </fieldset>

      {error && <p role="alert" className="badge danger">{error}</p>}
      <div><button type="submit">비교하기</button></div>
    </form>
  );
}

function OriginMap({ origin, onPick }: { origin: { lon: number; lat: number }; onPick: (lon: number, lat: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const markerRef = useRef<{ setMap(m: unknown): void } | null>(null);
  const mapRef = useRef<unknown>(null);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !ref.current) return;
        const map = new maps.Map(ref.current, { center: new maps.LatLng(origin.lat, origin.lon), level: 9 });
        mapRef.current = map;
        maps.event.addListener(map, "click", (e) => pickRef.current(e.latLng.getLng(), e.latLng.getLat()));
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // 최초 1회만 생성
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = window.kakao?.maps;
    if (!maps || !mapRef.current) return;
    markerRef.current?.setMap(null);
    markerRef.current = new maps.Marker({ position: new maps.LatLng(origin.lat, origin.lon), map: mapRef.current });
  }, [origin.lat, origin.lon]);

  if (failed) return <p className="hint">지도를 불러오지 못했습니다. 프리셋이나 좌표로 지정해 주세요.</p>;
  return <div ref={ref} className="map-box" style={{ height: 260, marginTop: 12 }} aria-label="지도를 클릭해 출발지 지정" />;
}
