/** 카카오모빌리티 길찾기 실측. 엔드포인트는 공식 문서 확인 전까지 docs/api-notes.md에 "미확인" */
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
// 미확인: 다중 목적지 엔드포인트/바디
await call("destinations", `${config.kakao.baseUrl}/v1/destinations/directions`, {
  method: "POST",
  body: JSON.stringify({ origin: seoul, destinations: [{ ...gapyeong, key: "41820" }, { x: 128.876, y: 37.752, key: "51150" }], radius: 10000, priority: "TIME" }),
});
await call("destinations-out-of-radius", `${config.kakao.baseUrl}/v1/destinations/directions`, {
  method: "POST",
  body: JSON.stringify({ origin: seoul, destinations: [{ x: 129.225, y: 35.856, key: "47130" }], radius: 10000, priority: "TIME" }),
});
// 미확인: 미래 운행 정보 엔드포인트/시각 형식 (YYYYMMDDHHmm 로 알려짐)
await call("future", `${config.kakao.baseUrl}/v1/future/directions?origin=${seoul.x},${seoul.y}&destination=${gapyeong.x},${gapyeong.y}&departure_time=202610100900&summary=true`);
await call("directions-same-point", `${config.kakao.baseUrl}/v1/directions?origin=${seoul.x},${seoul.y}&destination=${seoul.x},${seoul.y}&summary=true`);
