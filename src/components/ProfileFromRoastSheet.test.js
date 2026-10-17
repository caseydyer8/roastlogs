import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileFromRoastSheet from "./ProfileFromRoastSheet";

// A saved roast (oldest first) with one phase mark per label, a minute apart.
const roastWith = (labels) => ({
  id: 7,
  roastLog: [
    { type: "start_settings", t: 0, heat: "7", fan: "4", temp: "", label: "START" },
    ...labels.map((label, i) => ({ type: "phase", t: 60 * (i + 1), label, temp: "" })),
  ],
  curve: [],
});

// The one-line plan summary the sheet prints ("1 step · Yellowing 01:00 · ...").
const summaryOf = (roast) => {
  const html = renderToStaticMarkup(
    React.createElement(ProfileFromRoastSheet, {
      mode: "saved",
      roast,
      defaultName: "x",
      onSaveNew() {},
      onUpdate() {},
      onDismiss() {},
    })
  );
  return html.match(/>(\d+ steps?[^<]*)</)[1];
};

describe("ProfileFromRoastSheet plan summary", () => {
  it("lists the milestones it has a short name for", () => {
    expect(summaryOf(roastWith(["YELLOWING", "FIRST CRACK", "COOLING START"]))).toBe(
      "1 step · Yellowing 01:00 · First crack 02:00 · Drop 03:00"
    );
  });

  // Hygiene, not a crash fix: SHORT is a plain object, so a phase labelled
  // "constructor" found an inherited Object.prototype member and printed its
  // function source in the summary. Only the label's own entry may count.
  it("prints nothing for a label that only exists on Object.prototype", () => {
    expect(summaryOf(roastWith(["__proto__", "constructor", "toString", "FIRST CRACK"]))).toBe(
      "1 step · First crack 04:00"
    );
  });
});
