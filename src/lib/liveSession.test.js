import {
  SAVED_ROAST_KEY,
  LIVE_CURVE_KEY,
  liveSessionKeys,
  liveSessionStamp,
  liveSessionAlreadySaved,
  markRoastSaved,
  clearSavedMarker,
  settleSavedLiveSession,
} from "./liveSession";

// RL-043: SAVE ROAST saves exactly once. The marker SAVE ROAST leaves in the live
// session is honoured only when BOTH hold -- the roast it names is still in
// History, and its stamp is this session's. These tests pin each condition on its
// own, because a marker read carelessly drops the next real roast or wipes one
// that is under way.

const ROAST_ID = 1791935622377;
// A finished session: COOLING START logged at 3:02, four log rows.
const LOG = [{ type: "phase" }, { type: "phase" }, { type: "phase" }, { type: "start_settings" }];
const STAMP = liveSessionStamp(182, LOG.length);

function seedFinishedSession() {
  localStorage.setItem("live_elapsedSeconds", "182");
  localStorage.setItem("live_roastLog", JSON.stringify(LOG));
  localStorage.setItem("live_coolingStartTime", "182");
  localStorage.setItem(LIVE_CURVE_KEY, JSON.stringify([{ t: 1, bt: 200 }]));
  localStorage.setItem("live_beanName", "E2E Ethiopia");
  localStorage.setItem("live_greenWeightGrams", "227");
}

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

describe("liveSessionStamp", () => {
  it("is the same for the same session and differs when the clock or the log moves", () => {
    expect(liveSessionStamp(182, 4)).toBe(liveSessionStamp("182", 4));
    expect(liveSessionStamp(182, 4)).not.toBe(liveSessionStamp(183, 4));
    expect(liveSessionStamp(182, 4)).not.toBe(liveSessionStamp(182, 5)); // e.g. a RESUME row
  });
  it("turns anything unreadable into zeros rather than throwing", () => {
    expect(liveSessionStamp(null, undefined)).toBe("0:0");
    expect(liveSessionStamp("abc", NaN)).toBe("0:0");
  });
});

describe("liveSessionAlreadySaved", () => {
  it("is true when the marker names a roast that is in History and carries this session's stamp", () => {
    markRoastSaved(ROAST_ID, STAMP);
    expect(liveSessionAlreadySaved(STAMP, [{ id: 5 }, { id: ROAST_ID }])).toBe(true);
  });
  it("is false with no marker at all", () => {
    expect(liveSessionAlreadySaved(STAMP, [{ id: ROAST_ID }])).toBe(false);
  });
  it("is false when the roast it names is gone from History (deleted since)", () => {
    markRoastSaved(ROAST_ID, STAMP);
    expect(liveSessionAlreadySaved(STAMP, [{ id: 5 }])).toBe(false);
    expect(liveSessionAlreadySaved(STAMP, [])).toBe(false);
  });
  it("is false when the marker belongs to another session, even if its roast is in History", () => {
    markRoastSaved(ROAST_ID, liveSessionStamp(95, 3));
    expect(liveSessionAlreadySaved(STAMP, [{ id: ROAST_ID }])).toBe(false);
  });
  it("tolerates an id that came back as text, and holes or junk in the roast list", () => {
    markRoastSaved(String(ROAST_ID), STAMP);
    expect(liveSessionAlreadySaved(STAMP, [null, undefined, "x", { id: ROAST_ID }])).toBe(true);
    expect(liveSessionAlreadySaved(STAMP, null)).toBe(false);
    expect(liveSessionAlreadySaved(STAMP, "roasts")).toBe(false);
  });
  it("never trusts a malformed marker", () => {
    for (const raw of ["", "{", "null", "7", '"x"', "[]", "{}", `{"id":${ROAST_ID}}`, `{"stamp":"${STAMP}"}`, `{"id":null,"stamp":"${STAMP}"}`]) {
      localStorage.setItem(SAVED_ROAST_KEY, raw);
      expect(liveSessionAlreadySaved(STAMP, [{ id: ROAST_ID }])).toBe(false);
    }
  });
  it("never lets a blank or non-text id match a stored roast that has no id", () => {
    // Number("") === Number(null) === 0, so a blank marker id could otherwise vouch for a roast with id null.
    for (const id of ['""', '"   "', "false", "true", "[]", "{}"]) {
      localStorage.setItem(SAVED_ROAST_KEY, `{"id":${id},"stamp":"${STAMP}"}`);
      expect(liveSessionAlreadySaved(STAMP, [{ id: null }, { id: "" }, {}])).toBe(false);
    }
  });
});

describe("markRoastSaved / clearSavedMarker", () => {
  it("writes { id, stamp } under a live_ key, so the sign-in purge and clearLiveSession reach it", () => {
    markRoastSaved(ROAST_ID, STAMP);
    expect(SAVED_ROAST_KEY.startsWith("live_")).toBe(true);
    expect(JSON.parse(localStorage.getItem(SAVED_ROAST_KEY))).toEqual({ id: ROAST_ID, stamp: STAMP });
  });
  it("overwrites an earlier marker", () => {
    markRoastSaved(1, "1:1");
    markRoastSaved(ROAST_ID, STAMP);
    expect(JSON.parse(localStorage.getItem(SAVED_ROAST_KEY))).toEqual({ id: ROAST_ID, stamp: STAMP });
  });
  it("cannot break a save: a full quota is swallowed", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => markRoastSaved(ROAST_ID, STAMP)).not.toThrow();
  });
  it("clearSavedMarker removes it", () => {
    markRoastSaved(ROAST_ID, STAMP);
    clearSavedMarker();
    expect(localStorage.getItem(SAVED_ROAST_KEY)).toBeNull();
  });
});

describe("liveSessionKeys", () => {
  it("covers the marker and the curve, which are what a leftover would hide behind", () => {
    const keys = liveSessionKeys();
    expect(keys).toContain(SAVED_ROAST_KEY);
    expect(keys).toContain(LIVE_CURVE_KEY);
    expect(keys.every((k) => k.startsWith("live_"))).toBe(true);
  });
  it("keepSetup carries the bean, weight and level forward but still clears the marker", () => {
    const keep = liveSessionKeys({ keepSetup: true });
    const all = liveSessionKeys();
    for (const k of ["live_beanName", "live_beanId", "live_greenWeightGrams", "live_targetRoastLevel"]) {
      expect(all).toContain(k);
      expect(keep).not.toContain(k);
    }
    expect(keep).toContain(SAVED_ROAST_KEY);
    expect(keep).toContain("live_roastLog");
  });
});

describe("settleSavedLiveSession (boot)", () => {
  it("finishes the clear when the marker vouches for the stored session", () => {
    seedFinishedSession();
    markRoastSaved(ROAST_ID, STAMP);
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(true);
    for (const k of ["live_elapsedSeconds", "live_roastLog", "live_coolingStartTime", LIVE_CURVE_KEY, SAVED_ROAST_KEY]) {
      expect(localStorage.getItem(k)).toBeNull();
    }
    // ...exactly as the 2 s clear would: the setup carries forward.
    expect(localStorage.getItem("live_beanName")).toBe("E2E Ethiopia");
    expect(localStorage.getItem("live_greenWeightGrams")).toBe("227");
  });

  it("leaves the session alone when the roast the marker names is gone from History", () => {
    seedFinishedSession();
    markRoastSaved(ROAST_ID, STAMP);
    expect(settleSavedLiveSession([{ id: 5 }])).toBe(false);
    expect(localStorage.getItem("live_roastLog")).toBe(JSON.stringify(LOG));
    expect(localStorage.getItem("live_elapsedSeconds")).toBe("182");
    expect(localStorage.getItem(SAVED_ROAST_KEY)).toBeNull(); // the dead marker goes
  });

  it("leaves a different session alone even though the marker's roast IS in History", () => {
    seedFinishedSession();
    markRoastSaved(ROAST_ID, liveSessionStamp(95, 2));
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(false);
    expect(localStorage.getItem("live_roastLog")).toBe(JSON.stringify(LOG));
    expect(localStorage.getItem("live_elapsedSeconds")).toBe("182");
    expect(localStorage.getItem(SAVED_ROAST_KEY)).toBeNull();
  });

  it("does nothing to a session with no marker", () => {
    seedFinishedSession();
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(false);
    expect(localStorage.getItem("live_roastLog")).toBe(JSON.stringify(LOG));
  });

  it("treats an unreadable stored log as no match, never as a finished roast", () => {
    seedFinishedSession();
    localStorage.setItem("live_roastLog", "{not json");
    markRoastSaved(ROAST_ID, STAMP);
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(false);
    expect(localStorage.getItem("live_elapsedSeconds")).toBe("182");
  });

  it("is safe to run twice (a dev double-invoke): the second run finds nothing to do", () => {
    seedFinishedSession();
    markRoastSaved(ROAST_ID, STAMP);
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(true);
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(false);
    expect(localStorage.getItem("live_beanName")).toBe("E2E Ethiopia");
  });

  it("never throws at boot, even when storage itself does", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(settleSavedLiveSession([{ id: ROAST_ID }])).toBe(false);
  });
});
