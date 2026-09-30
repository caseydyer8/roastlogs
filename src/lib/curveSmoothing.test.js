import { smoothSeries, rorSeries } from "./curveSmoothing";

// Deterministic noise so the test is stable.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
const truth = (t) => 200 + 210 * (1 - Math.exp(-t / 260)) - 40 * Math.exp(-t / 25);
const truthRor = (t) => (truth(t + 1) - truth(t - 1)) * 30;

function noisyRoast(q, sd) {
  const r = rng(7);
  const gauss = () => {
    let u = 0;
    for (let i = 0; i < 6; i++) u += r();
    return (u - 3) / 0.7071;
  };
  return Array.from({ length: 661 }, (_, t) => Math.round((truth(t) + sd * gauss()) / q) * q);
}
const roughness = (a) => {
  let s = 0;
  let n = 0;
  for (let i = 60; i < a.length - 1; i++) {
    if (a[i] == null || a[i - 1] == null || a[i + 1] == null) continue;
    s += Math.abs(a[i + 1] - 2 * a[i] + a[i - 1]);
    n++;
  }
  return s / n;
};
const rmse = (a) => {
  let s = 0;
  let n = 0;
  for (let i = 60; i < 600; i++) {
    if (a[i] == null) continue;
    s += (a[i] - truthRor(i)) ** 2;
    n++;
  }
  return Math.sqrt(s / n);
};

describe("smoothSeries", () => {
  it("leaves a straight line unchanged and keeps nulls as nulls", () => {
    const line = [10, 12, 14, 16, 18, 20];
    expect(smoothSeries(line, 1).slice(1, -1)).toEqual([12, 14, 16, 18]);
    expect(smoothSeries([1, null, 3], 1)[1]).toBeNull();
  });
  it("calms probe noise without moving the trend", () => {
    const raw = noisyRoast(1, 0.5);
    expect(roughness(smoothSeries(raw, 2))).toBeLessThan(roughness(raw) / 3);
  });
});

describe("rorSeries", () => {
  it("recovers an exact constant slope (10 F per 30 s = 20 F/min)", () => {
    const line = Array.from({ length: 120 }, (_, t) => 200 + (t * 10) / 30);
    const ror = rorSeries(line);
    expect(ror[60]).toBeCloseTo(20, 5);
    expect(ror[0]).toBeCloseTo(20, 5); // one-sided window at the edges still works
    expect(ror[119]).toBeCloseTo(20, 5);
  });
  it("is much smoother than the 12s-difference recipe it replaces, and closer to the truth", () => {
    const raw = noisyRoast(1, 0.5);
    const old12 = raw.map((_, t) => (t >= 12 ? (raw[t] - raw[t - 12]) * 5 : null));
    const oldSmoothed = old12.map((_, t) => {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, t - 4); k <= Math.min(raw.length - 1, t + 4); k++) {
        if (old12[k] != null) {
          s += old12[k];
          n++;
        }
      }
      return n ? s / n : null;
    });
    const next = rorSeries(smoothSeries(raw, 1));
    expect(roughness(next)).toBeLessThan(roughness(oldSmoothed) / 3);
    expect(rmse(next)).toBeLessThan(rmse(oldSmoothed));
  });
  it("never bridges a signal dropout", () => {
    // 0.3 F/s (= 18 F/min) on both sides, but the probe reads 100 F higher after
    // the dead window. A fit that bridged the gap would smear that jump into the
    // slope; a fit that respects it reports 18 on each side and nothing inside.
    const line = Array.from({ length: 100 }, (_, t) => (t < 40 ? 200 + t * 0.3 : 300 + t * 0.3));
    for (let t = 40; t < 55; t++) line[t] = null;
    const ror = rorSeries(line);
    expect(ror[47]).toBeNull(); // inside the dropout
    expect(ror[38]).toBeCloseTo(18, 5); // window reaches the gap, uses only what came before
    expect(ror[57]).toBeCloseTo(18, 5); // and only what came after
    expect(ror[10]).toBeCloseTo(18, 5);
    expect(ror[90]).toBeCloseTo(18, 5);
  });
  it("returns null when there are too few points", () => {
    expect(rorSeries([200, 201, 202])).toEqual([null, null, null].map(() => null));
  });
});
