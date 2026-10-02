import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calibrator, estimateRoute, fitLine, median } from "@/lib/routing/estimate";
import { MockRouter, parseDirections } from "@/lib/routing/kakao";

describe("estimate", () => {
  it("직선 0km도 음수 없이", () => {
    expect(estimateRoute(-5)).toEqual({ distanceKm: 0, durationS: 600 });
  });
  it("median 홀수/짝수/빈 배열", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("fitLine: 정확한 직선을 복원, 분산 0이면 null", () => {
    expect(fitLine([1, 2, 3], [5, 7, 9])).toEqual({ a: 3, b: 2 });
    expect(fitLine([2, 2], [1, 3])).toBeNull();
    expect(fitLine([1], [1])).toBeNull();
  });
  it("calibrator: 표본 3개 미만이면 null", () => {
    expect(calibrator([{ straightKm: 10, distanceKm: 13, durationS: 900 }])).toBeNull();
  });
  it("calibrator: 거리는 비율 중앙값, 시간은 회귀선", () => {
    // 실제: 거리 = 직선 × 1.4, 시간 = 900 + 50·직선km
    const samples = [20, 40, 60, 80, 100].map((k) => ({ straightKm: k, distanceKm: k * 1.4, durationS: 900 + 50 * k }));
    const cal = calibrator(samples)!;
    const r = cal(150);
    expect(r.distanceKm).toBeCloseTo(210, 5);
    expect(r.durationS).toBe(900 + 50 * 150);
  });
  it("calibrator: 기울기가 0 이하면 비율 방식", () => {
    const samples = [20, 40, 60, 80, 100].map((k) => ({ straightKm: k, distanceKm: k * 1.3, durationS: 5000 - k }));
    const cal = calibrator(samples)!;
    expect(cal(150).durationS).toBeGreaterThan(0);
  });
});

describe("카카오 응답 파싱 (실측 녹화본)", () => {
  const dir = path.join(__dirname, "..", "fixtures", "kakao", "probe");
  const body = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf8")).body;
  it.skipIf(!fs.existsSync(dir))("자동차 길찾기: 거리·시간·통행료", () => {
    const r = parseDirections(body("directions"));
    expect(r.ok).toBe(true);
    expect(r.distanceM).toBeGreaterThan(50_000);
    expect(r.durationS).toBeGreaterThan(0);
    expect(r.tollWon).toBeGreaterThanOrEqual(0);
  });
  it.skipIf(!fs.existsSync(dir))("미래 운행 정보도 같은 형식", () => {
    expect(parseDirections(body("future")).ok).toBe(true);
  });
  it.skipIf(!fs.existsSync(dir))("출발=도착은 104 실패", () => {
    const r = parseDirections(body("directions-same-point"));
    expect(r).toMatchObject({ ok: false, resultCode: 104, distanceM: null });
  });
  it.skipIf(!fs.existsSync(dir))("녹화본에 키가 없다", () => {
    for (const f of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toMatch(/KakaoAK\s*[0-9a-f]{32}|[?&](appkey|code)=[0-9a-f]{32}/);
  });
});

describe("MockRouter", () => {
  it("제주 ↔ 육지는 경로 없음(1)", async () => {
    const r = await new MockRouter().directions({ lon: 126.98, lat: 37.57 }, { lon: 126.53, lat: 33.5 });
    expect(r).toMatchObject({ ok: false, resultCode: 1 });
  });
});
