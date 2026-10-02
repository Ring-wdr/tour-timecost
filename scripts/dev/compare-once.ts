/** 출발지 하나로 비교 1회 실행 (pnpm tsx scripts/dev/compare-once.ts <lon> <lat> [daytrip|overnight]) */
import "dotenv/config";
import { closeDb } from "@/lib/db";
import { runCompare } from "@/lib/compare";
import { compareInputSchema, upcomingSaturday } from "@/lib/compare-input";

const [lon, lat, trip] = process.argv.slice(2);
const t = Date.now();
const r = await runCompare(
  compareInputSchema.parse({
    origin: { lon: Number(lon), lat: Number(lat) },
    date: upcomingSaturday(),
    tripType: trip ?? "daytrip",
    people: 2,
    budget: 300_000,
    prefs: ["nature"],
  }),
);
const live = r.candidates.filter((c) => c.route.source === "live");
const est = r.candidates.filter((c) => c.route.source === "estimate");
console.log(`${Date.now() - t}ms 후보 ${r.candidates.length} (실측 ${live.length}, 보정 추정 ${est.length}) 제외 ${r.excluded.unreachable.join(", ") || "-"}`);
console.log("calls", JSON.stringify(r.calls));
for (const c of r.candidates.slice(0, 5))
  console.log(`  ${c.sidoName} ${c.name} ${Math.round(c.route.durationS / 60)}분 ${Math.round(c.route.distanceKm)}km 통행료 ${c.cost.toll} 주말 ${c.weekend ? Math.round(c.weekend.durationS / 60) + "분" : "-"} [${c.route.source}]`);
await closeDb();
