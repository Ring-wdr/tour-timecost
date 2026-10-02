import { NextResponse } from "next/server";
import { z } from "zod";
import { runCompare } from "@/lib/compare";
import { compareInputSchema } from "@/lib/compare-input";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }
  const parsed = compareInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력 오류", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }
  try {
    return NextResponse.json(await runCompare(parsed.data));
  } catch (e) {
    console.error("[api/compare]", e);
    return NextResponse.json({ error: "비교 계산 중 오류가 발생했습니다" }, { status: 500 });
  }
}
