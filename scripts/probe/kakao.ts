/** 카카오모빌리티 길찾기 실측. 엔드포인트·파라미터는 공식 문서(2026-10-02) 기준 */
import "dotenv/config";
import { config } from "@/lib/config";
import { saveProbe } from "./_save";

const key = process.env.KAKAO_REST_KEY;
if (!key) {
  console.log("[probe:kakao] KAKAO_REST_KEY 없음 → 건너뜀 (mock 라우터 사용)");
  process.exit(0);
}
const headers = { Authorization: `KakaoAK ${key}`, "Content-Type": "application/json" };
const seoul = { x: 126.978, y: 37.5665 };
const gapyeong = { x: 127.51, y: 37.831 };

async function call(name: string, url: string, init: RequestInit = {}) {
  try {
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    saveProbe("kakao", name, { url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined }, res.status, await res.text(), [key!]);
  } catch (e) {
    console.error(`[probe] ${name} 실패:`, (e as Error).message);
  }
}

await call("directions", `${config.kakao.baseUrl}/v1/directions?origin=${seoul.x},${seoul.y}&destination=${gapyeong.x},${gapyeong.y}&summary=true`);
// 다중 목적지: radius 최대 10000(문서). 반경 밖 목적지가 어떤 result_code로 오는지 확인용 (서비스에서는 미사용)
await call("destinations", `${config.kakao.baseUrl}/v1/destinations/directions`, {
  method: "POST",
  body: JSON.stringify({ origin: seoul, destinations: [{ ...gapyeong, key: "41820" }, { x: 128.876, y: 37.752, key: "51150" }], radius: 10000, priority: "TIME" }),
});
await call("destinations-out-of-radius", `${config.kakao.baseUrl}/v1/destinations/directions`, {
  method: "POST",
  body: JSON.stringify({ origin: seoul, destinations: [{ x: 129.225, y: 35.856, key: "47130" }], radius: 10000, priority: "TIME" }),
});
// 미래 운행 정보: departure_time=YYYYMMDDHHMM, 현재 이후 (문서)
const sat = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
await call("future", `${config.kakao.baseUrl}/v1/future/directions?origin=${seoul.x},${seoul.y}&destination=${gapyeong.x},${gapyeong.y}&departure_time=${sat}0900&summary=true`);
await call("directions-same-point", `${config.kakao.baseUrl}/v1/directions?origin=${seoul.x},${seoul.y}&destination=${seoul.x},${seoul.y}&summary=true`);
