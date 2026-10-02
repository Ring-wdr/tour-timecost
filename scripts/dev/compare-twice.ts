/** 같은 출발지로 두 번 조회해 두 번째가 캐시로 응답하는지 확인 */
import "dotenv/config";
import { closeDb } from "@/lib/db";
import { runCompare } from "@/lib/compare";
import { compareInputSchema, upcomingSaturday } from "@/lib/compare-input";

const input = compareInputSchema.parse({
  origin: { lon: 126.9784, lat: 37.5666, label: "서울시청" },
  date: upcomingSaturday(),
  tripType: "daytrip",
  people: 2,
  budget: 200_000,
  prefs: ["nature", "festival"],
});
for (const i of [1, 2]) {
  const t = Date.now();
  const r = await runCompare(input);
  console.log(`#${i} fromCache=${r.fromCache} ${Date.now() - t}ms calls=${JSON.stringify(r.calls)} 후보 ${r.candidates.length}, 예산내 ${r.candidates.filter((c) => !c.cost.overBudget).length}`);
  if (i === 1)
    for (const c of r.candidates.slice(0, 5))
      console.log(`  ${c.sidoName} ${c.name} ${Math.round(c.route.durationS / 60)}분 ${c.cost.total}원 toll=${c.cost.toll} score=${c.score.score} weekend=${c.weekend?.durationS}`);
}
// 출발지를 수백 m 옮겨도(반올림 동일) 라우팅 캐시 재사용
const r3 = await runCompare({ ...input, origin: { lon: 126.9801, lat: 37.5679 }, budget: 300_000 });
console.log(`#3 (근처 출발지, 예산 변경) fromCache=${r3.fromCache} calls=${JSON.stringify(r3.calls)}`);
await closeDb();
