import fs from "fs";
import path from "path";
import { smoothSeries, rorSeries } from "./curveSmoothing";
import { CARAMELIZATION_F } from "./roastPhases";
import { LIVE_GAP_S } from "./liveSample";
import {
  computeFcEta,
  formatEta,
  etaParts,
  NO_ETA,
  FC_TARGET_F,
  ROR_MIN,
  ROR_RELEASE_S,
  TURNAROUND_WINDOW,
} from "./fcEta";

// ---- helpers ---------------------------------------------------------------

// The chart's own recipe (buildLiveChartModel): temp is a +/-2 s average, RoR a
// centred +/-15 s slope over +/-1 s-smoothed temps. Used where a test wants the
// real shape of the edge; hand-built arrays are used where it wants exact numbers.
const recipe = (raw) => ({
  temps: smoothSeries(raw, 2),
  rors: rorSeries(smoothSeries(raw, 1), 15),
});
const line = (from, perMin, len) => Array.from({ length: len }, (_, t) => from + (perMin * t) / 60);
const fill = (len, v) => Array.from({ length: len }, () => v);
const eta = (args) => computeFcEta({ hasProbe: true, ...args });
// A 301-second series: BT climbing 30 F/min, so BT(300) = 370 and the textbook
// answer at the edge is (400 - 370) / 30 * 60 = 60 s.
const ramp370 = () => line(220, 30, 301);

// ---- constants -------------------------------------------------------------

describe("constants", () => {
  it("are the plan's numbers", () => {
    expect(FC_TARGET_F).toBe(400);
    expect(CARAMELIZATION_F).toBe(340);
    expect(ROR_MIN).toBe(5);
    expect(ROR_RELEASE_S).toBe(5);
    expect(TURNAROUND_WINDOW).toBe(240);
  });

  // App.js is ~5,500 lines and cannot be imported into a unit test, so read its
  // source. This is the drift guard: the ladder that LOGS caramelization and the
  // chip that FOLLOWS it must open at the same temperature. It accepts a bare
  // number (today) or the shared constant (once App.js imports it).
  const appSource = fs.readFileSync(path.join(__dirname, "..", "App.js"), "utf8");
  it("the App.js ladder still opens CARAMELIZATION at the shared 340", () => {
    const m = appSource.match(/label:\s*"CARAMELIZATION",\s*f:\s*([A-Za-z_0-9]+)/);
    expect(m).not.toBeNull();
    expect(m[1] === "CARAMELIZATION_F" || Number(m[1]) === CARAMELIZATION_F).toBe(true);
  });
  it("the App.js turnaround window is the one the late-join rule mirrors", () => {
    const m = appSource.match(/const TURNAROUND_WINDOW\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(TURNAROUND_WINDOW);
  });
});

// ---- the gate, and when it starts ------------------------------------------

describe("computeFcEta: equipment gate", () => {
  it("is hidden without a probe, whatever the data says", () => {
    const prior = { startedAt: 100, t: 290 };
    const r = computeFcEta({
      hasProbe: false,
      temps: ramp370(),
      rors: fill(301, 30),
      elapsed: 300,
      marks: { caramelization: 240 },
      prior,
    });
    expect(r.state).toBe("hidden");
    expect(r.seconds).toBeNull();
    expect(r.parts).toBeNull();
    expect(r.nextPrior).toBe(prior); // a gated-off call leaves the memory alone
  });

  it("is hidden when called with nothing at all", () => {
    expect(computeFcEta().state).toBe("hidden");
    expect(eta({}).state).toBe("hidden");
    expect(eta({ temps: "nope", rors: 7, marks: null, elapsed: "x" }).state).toBe("hidden");
  });
});

describe("computeFcEta: when caramelization has started", () => {
  it("stays hidden when BT never reached 340 and nothing was logged", () => {
    const temps = line(200, 30, 281).map((v) => Math.min(v, 339)); // tops out at 339
    expect(eta({ temps, rors: fill(281, 30), elapsed: 280 }).state).toBe("hidden");
  });

  it("starts on a CARAMELIZATION log entry even while smoothed BT still reads under 340", () => {
    const temps = line(200, 30, 281).map((v) => Math.min(v, 335));
    const r = eta({ temps, rors: fill(281, 30), elapsed: 280, marks: { caramelization: 279 } });
    expect(r.state).not.toBe("hidden");
  });

  it("starts on a rising crossing in the stored curve when no entry was logged", () => {
    const temps = line(200, 30, 291); // crosses 340 at t = 280
    expect(eta({ temps: temps.slice(0, 280), rors: fill(280, 30), elapsed: 279 }).state).toBe("hidden");
    expect(eta({ temps, rors: fill(291, 30), elapsed: 290 }).state).toBe("counting");
  });

  it("stays started after BT dips back under 340", () => {
    const temps = line(200, 30, 321).map((v, t) => (t > 290 ? 335 : v));
    const r = eta({ temps, rors: fill(321, 30), elapsed: 320 });
    expect(r.state).not.toBe("hidden");
  });

  it("finds a crossing across a dropout", () => {
    const temps = line(200, 30, 321).map((v, t) => (t > 250 && t < 300 ? null : v));
    // 250 reads 325 (under), then nothing, then 350 at t = 300: a crossing with a gap in it.
    expect(eta({ temps, rors: fill(321, 30), elapsed: 320 }).state).not.toBe("hidden");
  });

  it("ignores a hot charge: 360 at START, down to 250, hidden until the real crossing", () => {
    // Charge at 360, the beans pull it down to 250 at t = 60, then it climbs 30 F/min.
    const raw = Array.from({ length: 400 }, (_, t) => (t <= 60 ? 360 - (110 * t) / 60 : 250 + ((t - 60) * 30) / 60));
    // The climb is back at 340 at t = 240.
    expect(raw[240]).toBeCloseTo(340, 5);
    expect(eta({ temps: raw.slice(0, 200), rors: fill(200, 30), elapsed: 199 }).state).toBe("hidden");
    expect(eta({ temps: raw.slice(0, 241), rors: fill(241, 30), elapsed: 240 }).state).not.toBe("hidden");
  });

  it("a hot charge never becomes the 400 F overdue origin", () => {
    // Charge at 450, dip, climb through 340 at t = 240, now 345 at t = 250.
    const raw = Array.from({ length: 251 }, (_, t) => (t <= 60 ? 450 - (200 * t) / 60 : 250 + ((t - 60) * 30) / 60));
    const r = eta({ temps: raw, rors: fill(251, 30), elapsed: 250 });
    expect(r.state).toBe("counting");
    expect(r.seconds).toBeCloseTo(((400 - raw[250]) / 30) * 60, 6);
  });

  it("late join: a first sample of 350 after the turnaround window starts it", () => {
    const temps = Array.from({ length: 301 }, (_, t) => (t >= 300 ? 350 : null));
    const r = eta({ temps, rors: fill(301, null), elapsed: 300 });
    expect(r.state).toBe("held"); // started, but no RoR can exist yet
    expect(r.seconds).toBeNull();
    expect(r.parts.numeral).toBe(NO_ETA);
  });

  it("late join before the turnaround window is not a start", () => {
    const temps = Array.from({ length: 201 }, (_, t) => (t >= 200 ? 350 : null));
    expect(eta({ temps, rors: fill(201, null), elapsed: 200 }).state).toBe("hidden");
  });

  describe("a hot charge before a feed dropout, then a late rejoin", () => {
    // Probe reads 420 at START, the feed drops at t = 9, and comes back at t = 250
    // at 345 F climbing 25 F/min. The 420 belongs to a run that ended 240 s ago:
    // starting from the FIRST sample of the whole roast made it the 400 F origin
    // and showed "400 +4:10" the instant the probe came back.
    const rejoinRaw = (len) =>
      Array.from({ length: len }, (_, t) => (t <= 8 ? 420 : t >= 250 ? 345 + (25 * (t - 250)) / 60 : null));
    const at = (elapsed) => {
      const { temps, rors } = recipe(rejoinRaw(elapsed + 1));
      return eta({ temps, rors, elapsed });
    };

    it("does not fake 'overdue' off the hot charge", () => {
      expect(at(250).state).not.toBe("overdue");
      expect(at(260).state).not.toBe("overdue");
      expect(at(250).seconds).toBeNull(); // started, but no rate exists yet
    });

    it("starts from the rejoin and reads the real climb once a rate exists", () => {
      const r = at(300);
      const bt = recipe(rejoinRaw(301)).temps[300];
      expect(r.state).toBe("counting");
      expect(Math.abs(r.seconds - ((400 - bt) / 25) * 60)).toBeLessThanOrEqual(3);
    });

    it("a hole no wider than LIVE_GAP_S does not break the run", () => {
      // 420 from START with a 3 s hole (t = 9..11): the samples either side are
      // 4 s apart, inside LIVE_GAP_S, so it is still ONE run and the 400 F origin
      // is second 0 -- not the sample after the hole.
      const raw = Array.from({ length: 301 }, (_, t) => (t >= 9 && t <= 11 ? null : 420));
      const { temps, rors } = recipe(raw);
      const r = eta({ temps, rors, elapsed: 300 });
      expect(r.state).toBe("overdue");
      expect(r.seconds).toBe(300);
    });

    it("a hole one second wider than LIVE_GAP_S does break it", () => {
      const to = 8 + LIVE_GAP_S + 1; // last null second; the next sample is 7 s after t = 8
      const raw = Array.from({ length: 301 }, (_, t) => (t > 8 && t < to ? null : 420));
      const { temps, rors } = recipe(raw);
      const r = eta({ temps, rors, elapsed: 300 });
      expect(r.seconds).toBe(300 - to); // overdue, but counted from the rejoin
    });
  });

  it("a flat 350 from START shows nothing until the window has passed", () => {
    const len = TURNAROUND_WINDOW + 1;
    const temps = fill(len, 350);
    const rors = fill(len, 0);
    expect(eta({ temps: temps.slice(0, 100), rors: rors.slice(0, 100), elapsed: 99 }).state).toBe("hidden");
    expect(eta({ temps: temps.slice(0, len - 1), rors: rors.slice(0, len - 1), elapsed: len - 2 }).state).toBe("hidden");
    expect(eta({ temps, rors, elapsed: TURNAROUND_WINDOW }).state).toBe("held");
  });

  it("a late-join start latches through the prior, and only through it", () => {
    const temps = Array.from({ length: 321 }, (_, t) => (t < 300 ? null : t < 310 ? 350 : 335));
    const rors = fill(321, null);
    const first = eta({ temps: temps.slice(0, 301), rors: rors.slice(0, 301), elapsed: 300 });
    expect(first.state).toBe("held");
    // BT then sags under 340 with no crossing and no entry to hold the start in place.
    expect(eta({ temps, rors, elapsed: 320 }).state).toBe("hidden");
    expect(eta({ temps, rors, elapsed: 320, prior: first.nextPrior }).state).toBe("held");
  });

  it("drops a prior from an earlier roast when the clock goes backwards", () => {
    const stale = { startedAt: 250, t: 600 };
    const r = eta({ temps: fill(50, 250), rors: fill(50, 10), elapsed: 49, prior: stale });
    expect(r.state).toBe("hidden");
    expect(r.nextPrior.startedAt).toBeNull();
  });
});

// ---- the number ------------------------------------------------------------

describe("computeFcEta: counting", () => {
  it("a 30 F/min ramp at 370 F reads 60 s", () => {
    const temps = ramp370();
    const r = eta({ temps, rors: fill(301, 30), elapsed: 300 });
    expect(r.state).toBe("counting");
    expect(r.seconds).toBeCloseTo(60, 6);
    expect(r.parts).toEqual(expect.objectContaining({ label: "FC IN", numeral: "1:00", tag: null }));
  });

  it("the same ramp through the chart's own smoothing lands within 2 s", () => {
    const { temps, rors } = recipe(ramp370());
    const r = eta({ temps, rors, elapsed: 300 });
    expect(r.state).toBe("counting");
    expect(Math.abs(r.seconds - 60)).toBeLessThanOrEqual(2);
  });

  it("is idempotent: feeding nextPrior back changes nothing", () => {
    const args = { temps: ramp370(), rors: fill(301, 30), elapsed: 300 };
    const a = eta(args);
    const b = eta({ ...args, prior: a.nextPrior });
    expect(b).toEqual(a);
  });
});

describe("computeFcEta: held", () => {
  // Climbing at 30 F/min to 370, then the rate collapses for the last 10 seconds
  // while BT holds at 370: the number must stay, computed from the last good rate.
  const stalled = (tail) => ({
    temps: ramp370().map((v, t) => (t > 290 ? ramp370()[290] : v)),
    rors: Array.from({ length: 301 }, (_, t) => (t <= 290 ? 30 : tail)),
    elapsed: 300,
  });
  const expected = () => ((FC_TARGET_F - ramp370()[290]) / 30) * 60;

  it.each([
    ["exactly 0", 0],
    ["negative", -20],
    ["null at the edge", null],
    ["positive but under ROR_MIN", ROR_MIN - 1],
  ])("RoR %s -> held, from the last good rate, never null", (_name, tail) => {
    const r = eta(stalled(tail));
    expect(r.state).toBe("held");
    expect(r.seconds).not.toBeNull();
    expect(r.seconds).toBeCloseTo(expected(), 6);
    expect(r.parts.tag).toBe("HELD");
  });

  it("four good seconds are still held; the fifth makes it counting", () => {
    const rorsWith = (tailLen) =>
      Array.from({ length: 301 }, (_, t) => (t <= 280 ? 25 : t > 300 - tailLen ? 30 : 0));
    const temps = fill(301, 370);
    const four = eta({ temps, rors: rorsWith(4), elapsed: 300 });
    expect(four.state).toBe("held");
    expect(four.seconds).toBeCloseTo(((400 - 370) / 25) * 60, 6); // the OLD good rate
    const five = eta({ temps, rors: rorsWith(5), elapsed: 300 });
    expect(five.state).toBe("counting");
    expect(five.seconds).toBeCloseTo(((400 - 370) / 30) * 60, 6); // the NEW rate
  });

  it("a one-second spike never becomes the held rate", () => {
    const rors = Array.from({ length: 301 }, (_, t) => (t <= 270 ? 25 : t === 295 || t === 296 ? 150 : 0));
    const r = eta({ temps: fill(301, 370), rors, elapsed: 300, marks: { caramelization: 200 } });
    expect(r.state).toBe("held");
    expect(r.seconds).toBeCloseTo(((400 - 370) / 25) * 60, 6);
  });

  it("with every RoR null it is held with no number, not hidden", () => {
    const r = eta({ temps: fill(301, 350), rors: fill(301, null), elapsed: 300, marks: { caramelization: 250 } });
    expect(r.state).toBe("held");
    expect(r.seconds).toBeNull();
    expect(r.parts.numeral).toBe(NO_ETA);
  });

  it("a newest sample that is null is not read as 0 F (400 - null is 400)", () => {
    // BT measured through t = 290 (370 F), then nothing for ten seconds.
    const temps = ramp370().map((v, t) => (t > 290 ? null : v));
    const rors = fill(301, 30).map((v, t) => (t > 290 ? null : v));
    const r = eta({ temps, rors, elapsed: 300 });
    expect(r.state).toBe("held");
    expect(r.btAgeSeconds).toBe(10);
    expect(r.seconds).toBeCloseTo(((400 - temps[290]) / 30) * 60, 6);
    expect(r.seconds).toBeLessThan(120); // 400 / 30 * 60 would be 800
  });

  it("the held number is frozen, not a wall-clock countdown", () => {
    const temps = ramp370().map((v, t) => (t > 290 ? null : v));
    const rors = fill(301, 30).map((v, t) => (t > 290 ? null : v));
    const at300 = eta({ temps, rors, elapsed: 300 });
    const at330 = eta({ temps: temps.concat(fill(30, null)), rors: rors.concat(fill(30, null)), elapsed: 330 });
    expect(at330.state).toBe("held");
    expect(at330.seconds).toBe(at300.seconds);
  });

  it("a stall tracks the bean: held seconds follow BT while the rate stays frozen", () => {
    const sag = (bt) => ({
      temps: ramp370().map((v, t) => (t > 290 ? bt : v)),
      rors: Array.from({ length: 301 }, (_, t) => (t <= 290 ? 30 : -10)),
      elapsed: 300,
    });
    expect(eta(sag(360)).seconds).toBeGreaterThan(eta(sag(370)).seconds);
  });

  it("late join at 350: held with no number, then counting once a rate exists", () => {
    const raw = Array.from({ length: 341 }, (_, t) => (t >= 300 ? 350 + (20 * (t - 300)) / 60 : null));
    const at = (elapsed) => {
      const { temps, rors } = recipe(raw.slice(0, elapsed + 1));
      return eta({ temps, rors, elapsed });
    };
    const early = at(305);
    expect(early.state).toBe("held");
    expect(early.seconds).toBeNull();
    const later = at(330);
    expect(later.state).toBe("counting");
    expect(Math.abs(later.seconds - ((400 - (350 + (20 * 30) / 60)) / 20) * 60)).toBeLessThanOrEqual(3);
  });
});

describe("computeFcEta: a smooth decline (behaviour pinned on purpose)", () => {
  // After a heat cut the RoR does not jump below ROR_MIN, it slides. The "last
  // good" rate is then the newest second that is still >= ROR_MIN -- about
  // ROR_MIN itself -- so HELD reads (400 - BT) / ~5 x 60 = about (400 - BT) x 12 s:
  // LATE, by a wide margin, and frozen there while the bean sits. That is today's
  // contract (see the fcEta.js header). This test exists so that changing it is a
  // deliberate decision, not a side effect.
  it("HELD reads about (400 - BT) x 12 s, i.e. late, when the rate slid down to ROR_MIN", () => {
    const bt = 370;
    // 30 F/min sliding down by 0.11 F/min each second: the last second still >= 5
    // is t = 227 (5.03); every later one is under it.
    const rors = Array.from({ length: 301 }, (_, t) => 30 - 0.11 * t);
    const r = eta({ temps: fill(301, bt), rors, elapsed: 300, marks: { caramelization: 200 } });
    expect(r.state).toBe("held");
    expect(Math.abs(r.seconds - (FC_TARGET_F - bt) * 12)).toBeLessThanOrEqual(5);
    // For scale: at the rate the bean actually had when it was last climbing
    // (30 F/min) the same 30 F is a 60 s job. HELD says six times that.
    expect(r.seconds).toBeGreaterThan(((FC_TARGET_F - bt) / 30) * 60 * 5);
  });
});

describe("computeFcEta: a dying feed does not lie about freshness (lastRealBtT)", () => {
  // buildLiveChartModel repeats the last reading for up to LIVE_GAP_S after the
  // last REAL sample, and computeFcEta cannot tell a repeated second from a
  // measured one -- so without lastRealBtT it reports "measured this second" for six
  // seconds after the feed died. The caller supplies the second of the last real
  // sample, and RoR built from real samples only.
  const DIED_AT = 300;
  const real = ramp370(); // real samples t = 0..300, BT(300) = 370
  // What the chart model hands over `n` seconds after the feed died.
  const afterDeath = (n, { rorFrom = "real" } = {}) => {
    const len = DIED_AT + n + 1;
    const realOnly = Array.from({ length: len }, (_, t) => (t <= DIED_AT ? real[t] : null));
    const carried = Array.from({ length: len }, (_, t) =>
      t <= DIED_AT ? real[t] : t - DIED_AT <= LIVE_GAP_S ? real[DIED_AT] : null
    );
    return {
      temps: smoothSeries(carried, 2),
      rors: rorSeries(smoothSeries(rorFrom === "real" ? realOnly : carried, 1), 15),
      elapsed: len - 1,
      lastRealBtT: DIED_AT,
    };
  };

  it("reads age 0 at the last real sample, 4 four seconds on, and flips to held past the gap threshold", () => {
    const at = (n) => eta(afterDeath(n));
    expect(at(0).btAgeSeconds).toBe(0);
    expect(at(0).state).toBe("counting");
    expect(at(4).btAgeSeconds).toBe(4);
    expect(at(4).state).toBe("counting"); // still inside the freshness window
    expect(at(LIVE_GAP_S).btAgeSeconds).toBe(LIVE_GAP_S);
    expect(at(LIVE_GAP_S).state).toBe("counting");
    expect(at(LIVE_GAP_S + 1).btAgeSeconds).toBe(LIVE_GAP_S + 1);
    expect(at(LIVE_GAP_S + 1).state).toBe("held");
    expect(at(10).btAgeSeconds).toBe(10);
    expect(at(10).state).toBe("held");
  });

  it("the held number then stays frozen on the last real reading", () => {
    const first = eta(afterDeath(LIVE_GAP_S + 1));
    const later = eta(afterDeath(25));
    expect(later.state).toBe("held");
    expect(later.seconds).toBe(first.seconds);
    expect(Math.abs(first.seconds - 60)).toBeLessThanOrEqual(3); // (400 - 370) / 30 x 60
  });

  it("holds when RoR was built from the carried seconds too (the chart model today)", () => {
    const at = (n) => eta(afterDeath(n, { rorFrom: "carried" }));
    expect(at(4)).toEqual(expect.objectContaining({ state: "counting", btAgeSeconds: 4 }));
    expect(at(LIVE_GAP_S + 1)).toEqual(expect.objectContaining({ state: "held", btAgeSeconds: LIVE_GAP_S + 1 }));
  });

  it("a one-second clock-drift hole is not a feed death", () => {
    // Real samples through 299, a repeated 300, elapsed = 300: age 1, still counting.
    const realOnly = Array.from({ length: 301 }, (_, t) => (t <= 299 ? real[t] : null));
    const carried = Array.from({ length: 301 }, (_, t) => (t <= 299 ? real[t] : real[299]));
    const r = eta({
      temps: smoothSeries(carried, 2),
      rors: rorSeries(smoothSeries(realOnly, 1), 15),
      elapsed: 300,
      lastRealBtT: 299,
    });
    expect(r.btAgeSeconds).toBe(1);
    expect(r.state).toBe("counting");
  });

  it("without lastRealBtT the behaviour is today's, so existing callers do not change", () => {
    const { lastRealBtT, ...legacy } = afterDeath(4);
    expect(eta(legacy).btAgeSeconds).toBe(0); // the repeated reading reads as 'this second'
  });

  it.each([[null], [undefined], [NaN], [Infinity], ["300"]])("ignores a lastRealBtT of %p", (bad) => {
    const args = afterDeath(4);
    const { lastRealBtT, ...legacy } = args;
    expect(eta({ ...args, lastRealBtT: bad })).toEqual(eta(legacy));
  });

  it("a lastRealBtT from the future (clock skew) is age 0, never negative", () => {
    expect(eta({ ...afterDeath(0), lastRealBtT: DIED_AT + 5 }).btAgeSeconds).toBe(0);
  });

  it("with nothing measured there is no age to report", () => {
    expect(eta({ temps: [], rors: [], elapsed: 10, lastRealBtT: 3 }).btAgeSeconds).toBeNull();
  });
});

// ---- overdue and resolved --------------------------------------------------

describe("computeFcEta: overdue", () => {
  // Climbs 24 F/min and first touches 400 at t = 500, then eases back to 398.
  const overdueAt = (elapsed) => {
    const temps = Array.from({ length: elapsed + 1 }, (_, t) => (t <= 500 ? 200 + (t * 2) / 5 : 398));
    return eta({ temps, rors: fill(elapsed + 1, 20), elapsed });
  };

  it("counts up from the first 400 crossing, and stays latched when BT dips back", () => {
    const r = overdueAt(512);
    expect(r.state).toBe("overdue");
    expect(r.seconds).toBe(12);
    expect(r.parts).toEqual(expect.objectContaining({ label: "400\u00B0", numeral: "+0:12", tag: null }));
  });

  it("keeps counting up by the clock", () => {
    expect(overdueAt(560).seconds).toBe(60);
  });

  it("is overdue as soon as BT is at 400 with no first crack marked", () => {
    const temps = line(200, 30, 401).map((v) => Math.min(v, 400)); // touches 400 at t = 400
    const r = eta({ temps, rors: fill(401, 30), elapsed: 400 });
    expect(r.state).toBe("overdue");
    expect(r.seconds).toBe(0);
  });

  it("late join at 405 counts up from the join, not from a crossing nobody saw", () => {
    const temps = (n) => Array.from({ length: n }, (_, t) => (t >= 300 ? 405 : null));
    expect(eta({ temps: temps(301), rors: fill(301, null), elapsed: 300 }).seconds).toBe(0);
    const r = eta({ temps: temps(313), rors: fill(313, null), elapsed: 312 });
    expect(r.state).toBe("overdue");
    expect(r.seconds).toBe(12);
  });

  it("overdue holds up through a dropout: the clock keeps counting with no samples", () => {
    const temps = Array.from({ length: 531 }, (_, t) => (t <= 500 ? 200 + (t * 2) / 5 : t <= 505 ? 400 : null));
    const r = eta({ temps, rors: fill(531, null), elapsed: 530 });
    expect(r.state).toBe("overdue");
    expect(r.seconds).toBe(30);
  });
});

describe("computeFcEta: resolved", () => {
  const base = () => ({ temps: ramp370(), rors: fill(301, 30), elapsed: 300 });

  it("FIRST CRACK marked -> resolved, nothing to show", () => {
    const r = eta({ ...base(), marks: { firstCrack: 290 } });
    expect(r.state).toBe("resolved");
    expect(r.seconds).toBeNull();
    expect(r.parts).toBeNull();
  });

  it("COOLING START marked -> resolved even if first crack never was", () => {
    expect(eta({ ...base(), marks: { drop: 295 } }).state).toBe("resolved");
  });

  it("a mark counts as marked even if its time did not parse", () => {
    expect(eta({ ...base(), marks: { firstCrack: NaN } }).state).toBe("resolved");
  });

  it("resolved wins over a BT that is past 400", () => {
    const temps = fill(301, 410);
    expect(eta({ temps, rors: fill(301, 0), elapsed: 300, marks: { caramelization: 200, firstCrack: 280 } }).state).toBe("resolved");
  });

  it("comes back if the mark is removed (nothing is latched across it)", () => {
    const withMark = eta({ ...base(), marks: { firstCrack: 290 } });
    expect(eta({ ...base(), marks: {}, prior: withMark.nextPrior }).state).toBe("counting");
  });

  it("the gate still wins over resolved", () => {
    expect(computeFcEta({ ...base(), hasProbe: false, marks: { firstCrack: 290 } }).state).toBe("hidden");
  });
});

// ---- display ---------------------------------------------------------------

describe("formatEta", () => {
  it.each([
    [123, "counting", "2:05"],
    [59, "counting", "0:59"],
    [60, "counting", "1:00"],
    [61, "counting", "1:00"],
    [63, "counting", "1:05"],
    [0, "counting", "0:00"],
    [597, "counting", "9:55"],
    [598, "counting", ">9:59"],
    [600, "counting", ">9:59"],
    [5000, "held", ">9:59"],
    [null, "held", NO_ETA],
    [12, "overdue", "+0:12"],
    [754, "overdue", "+12:34"],
  ])("%s s (%s) -> %s", (seconds, state, text) => {
    expect(formatEta(seconds, state)).toBe(text);
  });
});

describe("etaParts", () => {
  it("has a label, a numeral and a tag for each visible state, and nothing otherwise", () => {
    expect(etaParts("counting", 125)).toEqual(
      expect.objectContaining({ label: "FC IN", numeral: "2:05", tag: null })
    );
    expect(etaParts("held", 125)).toEqual(expect.objectContaining({ label: "FC IN", numeral: "2:05", tag: "HELD" }));
    expect(etaParts("held", null)).toEqual(expect.objectContaining({ numeral: NO_ETA, tag: "HELD" }));
    expect(etaParts("overdue", 12)).toEqual(
      expect.objectContaining({ label: "400\u00B0", numeral: "+0:12", tag: null })
    );
    expect(etaParts("hidden", 5)).toBeNull();
    expect(etaParts("resolved", 5)).toBeNull();
  });

  it("muted is true when HELD or when the number is only a hint (over 9:59), else false", () => {
    expect(etaParts("counting", 125).muted).toBe(false);
    expect(etaParts("counting", 597).muted).toBe(false); // snaps to 9:55: still a number
    expect(etaParts("counting", 598).muted).toBe(true); // snaps to 600: shown as '>9:59'
    expect(etaParts("overdue", 12).muted).toBe(false);
    expect(etaParts("overdue", 754).muted).toBe(false); // a count-UP, never a hint
    expect(etaParts("held", 125).muted).toBe(true);
    expect(etaParts("held", null).muted).toBe(true);
    expect(etaParts("counting", 5000).muted).toBe(true);
    expect(etaParts("hidden", 5)).toBeNull();
  });

  it("BT 340 at 5.5 F/min is 654 s: '>9:59', muted, and says 'more than 10 minutes' aloud", () => {
    const temps = fill(301, 340);
    const r = eta({ temps, rors: fill(301, 5.5), elapsed: 300, marks: { caramelization: 250 } });
    expect(r.state).toBe("counting");
    expect(r.seconds).toBeCloseTo(((400 - 340) / 5.5) * 60, 6); // 654.5 s
    expect(r.parts.numeral).toBe(">9:59");
    expect(r.parts.muted).toBe(true);
    expect(r.parts.ariaLabel).toBe("First crack is more than 10 minutes away");
    // The same sentence for the same number, whichever state carries it.
    expect(etaParts("held", 654).ariaLabel).toBe("First crack is more than 10 minutes away");
    expect(etaParts("held", 654).muted).toBe(true);
  });

  it("gives a full-sentence aria label that agrees with the numeral", () => {
    expect(etaParts("counting", 125).ariaLabel).toMatch(/first crack in about 2 minutes 5 seconds/i);
    expect(etaParts("held", null).ariaLabel).toMatch(/not available|unavailable/i);
    expect(etaParts("overdue", 12).ariaLabel).toMatch(/400 degrees.*12 seconds/i);
  });
});
