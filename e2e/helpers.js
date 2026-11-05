const { expect, test } = require("@playwright/test");

// Why this exists
// ---------------
// The v3 app shell is a fixed-height flex column (`.app-shell` = 100dvh,
// overflow-hidden) whose <main> scrolls internally. That fixed the iOS
// "nav floats mid-page" bug, but it also silently broke the screenshot
// harness: once the document itself stops growing, Playwright's
// `{ fullPage: true }` can never capture more than one viewport. The
// baselines kept passing height checks while quietly covering nothing below
// the fold — including the Phase Milestones block.
//
// So for screenshots ONLY, relax the shell to auto height and let <main>
// overflow visibly. The document grows naturally again and full-page capture
// covers the whole screen as it did pre-v3. Production layout is untouched —
// this style tag exists for the duration of one assertion and is removed
// immediately after, even if the assertion throws.
//
// The pinned-nav behaviour this trades away from the screenshot is covered
// directly by an assertion instead ("app shell: bottom nav pinned to viewport
// bottom" in app.spec.js), which is a stronger guard than a pixel diff.
const UNSHELL_CSS = `
  .app-shell { height: auto !important; overflow: visible !important; }
  .app-shell > main { overflow: visible !important; }
`;

// The sync-status dot reflects live sync state. Supabase is blocked in tests,
// so it settles on 'error' (red) — but WHEN it settles races the screenshot,
// which previously baked a green dot into some baselines and a red one into
// others. Mask it rather than delete the coverage around it.
function syncDot(page) {
  return page.locator('[title^="Sync status"]');
}

async function fullPageShot(page, name, options = {}) {
  // Visual assertions are skippable where a container cannot produce the
  // single -linux.png baseline set, but NEVER silently. The annotation is the
  // whole point: a bypassed screenshot check that still reports green is a
  // test covering nothing, which is precisely the failure the UNSHELL_CSS
  // note above records from the v3 shell change — baselines kept passing
  // while quietly capturing nothing below the fold. Annotated, the report
  // names every check that did not actually run.
  //
  // This function is the suite's ONLY caller of toHaveScreenshot, so this one
  // guard covers all 44 baselines.
  if (process.env.RL_SKIP_VISUAL === "1") {
    test.info().annotations.push({ type: "visual-skipped", description: name });
    return;
  }
  const { mask = [], ...rest } = options;
  const styleTag = await page.addStyleTag({ content: UNSHELL_CSS });
  try {
    await expect(page).toHaveScreenshot(name, {
      fullPage: true,
      mask: [syncDot(page), ...mask],
      ...rest,
    });
  } finally {
    // Always restore, so a failed assertion can't leak relaxed layout into
    // whatever the test asserts next.
    await styleTag.evaluate((el) => el.remove()).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Test doubles for the two Supabase paths the live chart depends on. Both are
// answered INSIDE the browser by Playwright -- nothing reaches the network, so
// the suite's "no real Supabase traffic" guarantee holds. The per-test
// `context.route(/supabase\.co/, abort)` in beforeEach stays the backstop: any
// request these do not answer falls through to it.
// ---------------------------------------------------------------------------

// A RoastLink bridge on the realtime channel, publishing a steady bean temp.
// useLiveRoast subscribes to the private "roastlink-live" channel over a
// websocket speaking Phoenix's v2 wire format: [join_ref, ref, topic, event,
// payload]. This answers just enough of it -- join and leave replies, heartbeat,
// one presence entry with role "bridge" -- and then pushes a `sample` broadcast
// every 500ms, so the hook reads "live" and the chart renders.
//
// Call it BEFORE the page loads the app (routes survive a reload). It does not
// replace the real feed's security: the channel's RLS lives in the database, and
// this never contacts it.
//
// `bt` is what the bridge reads. A number is the base of the 5-sample sawtooth
// the feed has always published (bt, bt+1 ... bt+4, repeating); a function
// `fn(n)` returns the exact reading for sample n, counted from 0 since the last
// `set` (or since the call), across reloads. It returns a controller, which
// callers that only want a steady feed simply ignore:
//   set(btOrFn)     change what the bridge reads from the next sample on, e.g.
//                   `set((n) => 330 + 0.5 * n)` for a ramp. Samples are 500 ms
//                   apart, so a step of x per sample is 2x per second.
//   dropBridge()    the bridge app quits: samples stop and the channel's presence
//                   resyncs with nobody on it (the hook reads "no-bridge" after
//                   STALE_MS). It stays down for sockets the page opens later, so
//                   call it BEFORE a load to start a page with the feed already gone.
//   restoreBridge() the bridge app comes back: presence resyncs with the bridge on
//                   it and samples resume at the next tick (hook: "bridge-only",
//                   then "live" on the first sample). Also applies to later sockets.
// `announce: false` joins the channel but NEVER sends a presence frame -- not at
// join, and not from dropBridge()/restoreBridge() either. It withholds PRESENCE
// only. useLiveRoast flips to "live" on any sample, presence synced or not, so the
// hook stays in "connecting" only while no sample arrives either. To hold it there
// (the few seconds after every reload), pair it with dropBridge() BEFORE the load.
async function mockRoastLinkFeed(page, { bt = 250, announce = true } = {}) {
  const TOPIC = "realtime:roastlink-live";
  const feed = { source: bt, ticks: 0, bridgeUp: true };
  const sockets = new Set();
  const nextBt = () => {
    const n = feed.ticks++;
    return typeof feed.source === "function" ? feed.source(n) : feed.source + (n % 5);
  };
  const presenceState = () => JSON.stringify([null, null, TOPIC, "presence_state",
    feed.bridgeUp ? { "bridge-e2e": { metas: [{ phx_ref: "e2e", role: "bridge" }] } } : {}]);
  // Presence is re-announced to every open socket whenever the bridge comes or goes.
  const announceToAll = () => {
    if (!announce) return;
    for (const ws of sockets) {
      try { ws.send(presenceState()); } catch (e) { /* closing */ }
    }
  };
  await page.routeWebSocket(/supabase\.co\/realtime/, (ws) => {
    sockets.add(ws);
    const timer = setInterval(() => {
      if (!feed.bridgeUp) return;
      try {
        ws.send(JSON.stringify([null, null, TOPIC, "broadcast",
          { type: "broadcast", event: "sample", payload: { bt: nextBt() } }]));
      } catch (e) {
        clearInterval(timer); // the page went away between ticks
      }
    }, 500);
    ws.onClose(() => { clearInterval(timer); sockets.delete(ws); });
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event] = JSON.parse(String(raw));
      const reply = (response = {}) =>
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "heartbeat") {
        ws.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]));
      } else if (event === "phx_join") {
        reply({ postgres_changes: [] });
        if (announce) ws.send(presenceState());
      } else if (event === "phx_leave") {
        reply();
      }
    });
  });
  return {
    set(btOrFn) {
      feed.source = btOrFn;
      feed.ticks = 0;
    },
    dropBridge() {
      feed.bridgeUp = false;
      announceToAll();
    },
    restoreBridge() {
      feed.bridgeUp = true;
      announceToAll();
    },
  };
}

// A cloud whose `roasts` table holds exactly `rows` (raw snake_case rows) and
// whose other synced tables are empty -- but which answers the roasts read only
// when the test calls `release()`. The launch sync therefore sits in "syncing"
// for as long as the test wants, which makes "the roast arrives AFTER the app
// has mounted" something a test can assert before and after, with no sleeps.
//
// The other tables answer at once. Left to the beforeEach abort, the client
// retries each failed read with a back-off, which holds the sync in "syncing"
// for tens of seconds in total. Writes are never answered: they fall through to
// the abort.
//
// Call it BEFORE the page loads the app; `release` is idempotent.
async function holdCloudRoasts(page, rows) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const answer = (route, body) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  await page.route(/\/rest\/v1\/roasts(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await gate;
    await answer(route, rows);
  });
  await page.route(/\/rest\/v1\/(tasting_notes|beans|roast_profiles)(\?|$)/, (route) =>
    route.request().method() === "GET" ? answer(route, []) : route.fallback()
  );
  return { release };
}

module.exports = { fullPageShot, syncDot, mockRoastLinkFeed, holdCloudRoasts };
