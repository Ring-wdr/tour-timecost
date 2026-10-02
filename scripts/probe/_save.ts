import fs from "node:fs";
import path from "node:path";

/** 원본 응답을 키를 지운 요청 정보와 함께 저장 */
export function saveProbe(dir: string, name: string, req: { url: string; method?: string; body?: unknown }, status: number, text: string, secrets: string[]) {
  let url = req.url;
  for (const s of secrets) {
    if (!s) continue;
    url = url.replaceAll(s, "<REDACTED>").replaceAll(encodeURIComponent(s), "<REDACTED>");
  }
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* XML 등은 문자열 그대로 */
  }
  const out = path.join(process.cwd(), "fixtures", dir, "probe");
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${name}.json`);
  const content = JSON.stringify({ recordedAt: new Date().toISOString(), request: { ...req, url }, status, body }, null, 1);
  for (const s of secrets) if (s && content.includes(s)) throw new Error("키가 픽스처에 남아 있음");
  fs.writeFileSync(file, content + "\n");
  console.log(`[probe] ${name}: HTTP ${status} → ${path.relative(process.cwd(), file)}`);
}
