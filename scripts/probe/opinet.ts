/** 오피넷 전국 평균가 실측 */
import "dotenv/config";
import { saveProbe } from "./_save";

const key = process.env.OPINET_KEY;
if (!key) {
  console.log("[probe:opinet] OPINET_KEY 없음 → 건너뜀 (설정 기본 유가 사용)");
  process.exit(0);
}
const url = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${encodeURIComponent(key)}`;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  saveProbe("opinet", "avgAllPrice", { url }, res.status, await res.text(), [key]);
} catch (e) {
  console.error("[probe] avgAllPrice 실패:", (e as Error).message);
}
