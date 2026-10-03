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

module.exports = { fullPageShot, syncDot };
