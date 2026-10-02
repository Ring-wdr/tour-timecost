"use client";

/* 카카오 지도 SDK 최소 타입 */
export interface KakaoLatLng { getLat(): number; getLng(): number }
export interface KakaoMaps {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => { extend(p: KakaoLatLng): void };
  Map: new (el: HTMLElement, opts: { center: KakaoLatLng; level: number }) => {
    setBounds(b: unknown): void;
    setCenter(p: KakaoLatLng): void;
    relayout(): void;
  };
  Marker: new (opts: { position: KakaoLatLng; map?: unknown; title?: string; zIndex?: number }) => { setMap(m: unknown): void; setZIndex(z: number): void };
  CustomOverlay: new (opts: { position: KakaoLatLng; content: HTMLElement | string; map?: unknown; yAnchor?: number; zIndex?: number }) => { setMap(m: unknown): void };
  event: { addListener(target: unknown, type: string, cb: (e: { latLng: KakaoLatLng }) => void): void };
}

declare global {
  interface Window { kakao?: { maps: KakaoMaps } }
}

export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

let loading: Promise<KakaoMaps> | null = null;

/** SDK를 한 번만 로드. 키가 없으면 reject → 호출 측은 대체 UI를 보여준다 */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_JS_KEY 없음"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const fail = (msg: string) => {
      loading = null;
      clearTimeout(timer);
      reject(new Error(msg));
    };
    // 도메인 미등록·서비스 비활성 시 SDK가 오류 본문을 주고 kakao 객체를 만들지 않는다 → 시간 제한으로 대체 UI
    const timer = setTimeout(() => fail("카카오 지도 SDK 시간 초과"), 8000);
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
    s.async = true;
    s.onload = () => {
      if (!window.kakao?.maps) return fail("카카오 지도 SDK 초기화 실패 (도메인 등록·카카오맵 사용 설정 확인)");
      window.kakao.maps.load(() => {
        clearTimeout(timer);
        resolve(window.kakao!.maps);
      });
    };
    s.onerror = () => fail("카카오 지도 SDK 로드 실패");
    document.head.appendChild(s);
  });
  return loading;
}
