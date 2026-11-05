import { shouldAutoOpenLiveChart, readoutFeedStatus, AUTO_OPEN_WINDOW_MS } from "./liveChartAutoOpen";

// RL-063: when the Roast tab opens the live chart by itself. The chart is ~260 px
// tall and sits above the Mark / PAUSE row, so the one thing it must never do is
// appear while the roaster's thumb is resting on that row. It opens only when
//   - the setup has a probe and a roast is under way,
//   - the roast has not reached COOLING START (a reload there must not push SAVE ROAST down),
//   - the chart can be drawn NOW (the feed is live or bridge-only, or the roast already has a curve),
//   - and that first drawable moment is close to START or to the page load.
// A bridge that joins 6 minutes in therefore gets the readout, collapsed, and the roaster taps it.

const base = {
  hasProbe: true,
  roastStarted: true,
  coolingStarted: false,
  status: "live",
  curvePoints: 0,
  sinceMs: 0,
};
const decide = (over) => shouldAutoOpenLiveChart({ ...base, ...over });

describe("shouldAutoOpenLiveChart", () => {
  it("keeps the window at about 15 seconds", () => {
    expect(AUTO_OPEN_WINDOW_MS).toBe(15000);
  });

  it("opens at START on a live probe roast", () => {
    expect(decide({})).toBe(true);
  });

  it("opens when the bridge is present but the device has not sent a sample yet (bridge-only)", () => {
    expect(decide({ status: "bridge-only" })).toBe(true);
  });

  it("opens on a reload into a roast whose curve is stored, while the feed is still connecting", () => {
    expect(decide({ status: "connecting", curvePoints: 130 })).toBe(true);
    expect(decide({ status: "idle", curvePoints: 1 })).toBe(true);
    expect(decide({ status: "no-bridge", curvePoints: 40 })).toBe(true);
  });

  it("does not open when there is nothing to draw: no feed and no curve", () => {
    for (const status of ["idle", "connecting", "no-bridge"]) {
      expect(decide({ status, curvePoints: 0 })).toBe(false);
    }
  });

  it("does not open without a probe, or before a roast is under way", () => {
    expect(decide({ hasProbe: false })).toBe(false);
    expect(decide({ roastStarted: false })).toBe(false);
  });

  it("does not open once COOLING START is logged, even on a reload with a curve and a live feed", () => {
    expect(decide({ coolingStarted: true })).toBe(false);
    expect(decide({ coolingStarted: true, status: "connecting", curvePoints: 300 })).toBe(false);
  });

  it("does not open when the first drawable moment is late: a bridge that joins mid-roast", () => {
    expect(decide({ sinceMs: AUTO_OPEN_WINDOW_MS + 1 })).toBe(false);
    expect(decide({ sinceMs: 20000 })).toBe(false);
    expect(decide({ sinceMs: 6.5 * 60 * 1000 })).toBe(false);
  });

  it("still opens at the edge of the window", () => {
    expect(decide({ sinceMs: AUTO_OPEN_WINDOW_MS })).toBe(true);
    expect(decide({ sinceMs: 14999 })).toBe(true);
  });

  it("treats a time it cannot read as late, never as on time", () => {
    for (const sinceMs of [NaN, undefined, null, Infinity, "5"]) {
      expect(decide({ sinceMs })).toBe(false);
    }
  });
});

// RL-063 D8: "Connecting" has a ceiling. The hook says "connecting" from mount until its
// first presence sync, and has no error state: offline, or a Realtime that refused the
// subscribe, leaves it connecting for the rest of the roast. A label that keeps promising a
// feed that is not coming is a lie, so once the ceiling (the same ~15 s as the auto-open
// window, one rule) has passed, a feed that has not answered reads as lost. A feed that HAS
// answered is never rewritten.
describe("readoutFeedStatus", () => {
  it("leaves 'connecting' and 'idle' alone before the ceiling", () => {
    expect(readoutFeedStatus("connecting", false)).toBe("connecting");
    expect(readoutFeedStatus("idle", false)).toBe("idle");
  });

  it("turns a feed that has not answered into 'no-bridge' once the ceiling has passed", () => {
    expect(readoutFeedStatus("connecting", true)).toBe("no-bridge");
    expect(readoutFeedStatus("idle", true)).toBe("no-bridge");
  });

  it("never rewrites a feed that has answered, however late", () => {
    for (const status of ["live", "bridge-only", "no-bridge"]) {
      expect(readoutFeedStatus(status, true)).toBe(status);
      expect(readoutFeedStatus(status, false)).toBe(status);
    }
  });

  it("only a ceiling that is exactly true counts; a missing or odd flag is not a ceiling", () => {
    for (const passed of [undefined, null, 0, 1, "true", NaN]) {
      expect(readoutFeedStatus("connecting", passed)).toBe("connecting");
    }
  });

  it("passes a status it does not know straight through", () => {
    expect(readoutFeedStatus("something-else", true)).toBe("something-else");
    expect(readoutFeedStatus(undefined, true)).toBe(undefined);
  });
});
