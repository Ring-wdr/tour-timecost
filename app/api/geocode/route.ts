import { NextResponse } from "next/server";
import { z } from "zod";
import { cacheKey, getCache, setCache } from "@/lib/cache";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const addressSchema = z.object({
  documents: z.array(z.object({ address_name: z.string(), x: z.coerce.number(), y: z.coerce.number() })),
});
const keywordSchema = z.object({
  documents: z.array(
    z.object({ place_name: z.string(), address_name: z.string(), x: z.coerce.number(), y: z.coerce.number() }),
  ),
});

type Result = { label: string; lon: number; lat: number };

class KakaoLocalError extends Error {}

async function kakaoLocal(path: string, q: string): Promise<unknown> {
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/${path}?query=${encodeURIComponent(q)}&size=5`, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json();
  if (!res.ok) {
    // 예: {"errorType":"NotAuthorizedError","message":"App(...) disabled OPEN_MAP_AND_LOCAL service."} → 콘솔에서 카카오맵 사용 설정 필요
    throw new KakaoLocalError((json as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return json;
}

/**
 * 주소·장소명 → 좌표 (카카오 로컬 API, KAKAO_REST_KEY 필요).
 * 주소 검색이 0건이면 키워드 검색("강릉역" 같은 장소명)으로 다시 찾는다. 결과가 있을 때만 30일 캐시.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q 필요" }, { status: 400 });
  if (!env.KAKAO_REST_KEY) return NextResponse.json({ error: "주소 검색 비활성 (KAKAO_REST_KEY 없음)" }, { status: 501 });
  const key = cacheKey("kakao:geocode", { q, v: 2 });
  const hit = await getCache<{ results: Result[] }>(key);
  if (hit) return NextResponse.json(hit.value);
  try {
    let results: Result[] = addressSchema
      .parse(await kakaoLocal("address.json", q))
      .documents.map((d) => ({ label: d.address_name, lon: d.x, lat: d.y }));
    if (!results.length) {
      results = keywordSchema
        .parse(await kakaoLocal("keyword.json", q))
        .documents.map((d) => ({ label: `${d.place_name} (${d.address_name})`, lon: d.x, lat: d.y }));
    }
    const out = { results };
    if (results.length) await setCache(key, "kakao:geocode", out, 30 * 86_400);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof KakaoLocalError ? `카카오 주소 검색 거부: ${e.message}` : `주소 검색 실패: ${(e as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
