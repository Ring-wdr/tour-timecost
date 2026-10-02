import { NextResponse } from "next/server";
import { z } from "zod";
import { cacheKey, getCache, setCache } from "@/lib/cache";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  documents: z.array(z.object({ address_name: z.string(), x: z.coerce.number(), y: z.coerce.number() })),
});

/** 주소 → 좌표 (카카오 로컬 API, KAKAO_REST_KEY 필요). 결과 30일 캐시 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q 필요" }, { status: 400 });
  if (!env.KAKAO_REST_KEY) return NextResponse.json({ error: "주소 검색 비활성 (KAKAO_REST_KEY 없음)" }, { status: 501 });
  const key = cacheKey("kakao:geocode", { q });
  const hit = await getCache<unknown>(key);
  if (hit) return NextResponse.json(hit.value);
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=5`, {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = schema.parse(await res.json());
    const out = { results: data.documents.map((d) => ({ label: d.address_name, lon: d.x, lat: d.y })) };
    await setCache(key, "kakao:geocode", out, 30 * 86_400);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `주소 검색 실패: ${(e as Error).message}` }, { status: 502 });
  }
}
