#!/usr/bin/env node
"use strict";

// RoastLogs ledger. Node core only, no dependencies.
//
//   node .claude/tools/ledger.js list [--all|--status=open|--json]
//   node .claude/tools/ledger.js add --title=... --type=... --severity=... \
//                                   --source=... [--body=...] [--acceptance=...] \
//                                   [--blocked-on=...] [--status=...] [--visual-pending]
//   node .claude/tools/ledger.js close RL-00N [--acceptance=...]
//   node .claude/tools/ledger.js render [--check]
//   node .claude/tools/ledger.js validate
//
// docs/ledger.json is TRACKED and travels between the Mac and the HP. It is not
// .session/ state: a hash proven on one machine says nothing about the other,
// but an open action is an open action everywhere.
//
// `id` is assigned once from next_id and NEVER reused, including after an item
// is deleted. Table row numbers renumber when a row is removed, which is
// exactly why the ledger does not key on position.

const fs = require("fs");
const path = require("path");

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LEDGER = path.join(ROOT, "docs", "ledger.json");
const NEXT_SESSION = path.join(ROOT, "docs", "NEXT-SESSION.md");
const PENDING_DIR = path.join(ROOT, "findings", "pending");

const TYPES = ["bug", "security", "feature", "idea", "chore"];
const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const STATUSES = ["open", "in-progress", "blocked", "done"];
const SOURCES = [
  "case",
  "test-regression",
  "secret-scan",
  "post-deploy",
  "npm-audit",
  "supabase-advisor",
  "security-auditor",
  "rls-audit",
  "external-review",
];

// Source tiers.
//   direct   — trusted to set their own severity.
//   demoted  — a scanner's opinion of severity is not evidence, so it is
//              forced to info regardless of what it claims.
//   refused  — judgement-bearing reviewers. These write to findings/pending/
//              and a HUMAN promotes them. An agent that can file its own
//              findings as ledger items can manufacture its own mandate.
const TIER_DIRECT = ["case", "test-regression", "secret-scan", "post-deploy"];
const TIER_DEMOTED = ["npm-audit", "supabase-advisor"];
const TIER_REFUSED = ["security-auditor", "rls-audit", "external-review"];

// The 2026-09-07 outage encoded as a rule. Revoking EXECUTE on is_admin looked
// safe and took the whole app down, because an RLS policy expression is
// evaluated with the privileges of the role running the query. Anything naming
// a grant, a policy, or SECURITY DEFINER is never auto-actioned again.
const HUMAN_PATTERNS = [/\bgrants?\b/i, /\bpolic(?:y|ies)\b/i, /security\s+definer/i];

function die(msg, code = 1) {
  process.stderr.write(`ledger: ${msg}\n`);
  process.exit(code);
}

function load() {
  let raw;
  try {
    raw = fs.readFileSync(LEDGER, "utf8");
  } catch (e) {
    die(`cannot read ${LEDGER}: ${e.message}`);
  }
  let d;
  try {
    d = JSON.parse(raw);
  } catch (e) {
    die(`${LEDGER} is not valid JSON: ${e.message}`);
  }
  if (!d || !Array.isArray(d.items)) die("ledger has no items array");
  return d;
}

function save(d) {
  fs.writeFileSync(LEDGER, JSON.stringify(d, null, 2) + "\n");
}

function args(argv) {
  const flags = {};
  const rest = [];
  for (const a of argv) {
    if (a.startsWith("--")) {
      const i = a.indexOf("=");
      if (i === -1) flags[a.slice(2)] = true;
      else flags[a.slice(2, i)] = a.slice(i + 1);
    } else rest.push(a);
  }
  return { flags, rest };
}

function needsHuman(item) {
  const hay = [item.title, item.body, item.acceptance].filter(Boolean).join(" \n ");
  return HUMAN_PATTERNS.some((re) => re.test(hay));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// --- render -----------------------------------------------------------------
// Collapses a cell to one table-safe line. A literal | would split the column
// and a newline would end the row, so both are neutralised rather than trusted.
function cell(s) {
  return String(s == null ? "" : s)
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function tableFor(items) {
  const rows = items
    .filter((i) => i.status !== "done")
    .map((i) => {
      const flags = [];
      if (i.requires_human) flags.push("HUMAN-ONLY");
      if (i.visual_pending) flags.push("visual pending");
      const tag = flags.length ? ` _(${flags.join(", ")})_` : "";
      const what = `**${cell(i.title)}** — ${cell(i.body)}${tag}`;
      return `| ${i.id} | ${what} | ${cell(i.blocked_on) || "Nothing"} |`;
    });
  return ["| # | What | Blocked on |", "|---|---|---|", ...rows].join("\n");
}

function renderCmd(flags) {
  const d = load();
  const table = tableFor(d.items);
  let md;
  try {
    md = fs.readFileSync(NEXT_SESSION, "utf8");
  } catch (e) {
    die(`cannot read ${NEXT_SESSION}: ${e.message}`);
  }

  // Replace the existing table in place: header, separator, then every
  // contiguous row line. Anchored on the header so nothing outside the table
  // can be touched — the rest of the document stays byte-identical.
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l));
  if (start === -1) die("no '| # | ... |' table header found in NEXT-SESSION.md");
  let end = start;
  while (end + 1 < lines.length && /^\|/.test(lines[end + 1])) end++;

  const next = [...lines.slice(0, start), ...table.split("\n"), ...lines.slice(end + 1)].join("\n");

  if (flags.check) {
    if (next !== md) {
      process.stderr.write(
        "ledger: NEXT-SESSION.md table is out of date with docs/ledger.json.\n" +
          "        The table is generated output — run `node .claude/tools/ledger.js render`\n" +
          "        rather than editing it by hand.\n"
      );
      process.exit(1);
    }
    process.stdout.write("render: table matches the ledger\n");
    return;
  }

  if (next === md) {
    process.stdout.write("render: already up to date\n");
    return;
  }
  fs.writeFileSync(NEXT_SESSION, next);
  process.stdout.write(
    `render: rewrote the table (${lines.slice(start, end + 1).length} lines -> ${
      table.split("\n").length
    })\n`
  );
}

// --- validate ---------------------------------------------------------------
function validateCmd() {
  const d = load();
  const errs = [];
  const seen = new Set();

  for (const i of d.items) {
    const at = i.id || "(missing id)";
    if (!i.id || !/^RL-\d{3,}$/.test(i.id)) errs.push(`${at}: id must look like RL-001`);
    if (seen.has(i.id)) errs.push(`${at}: duplicate id`);
    seen.add(i.id);
    if (!i.title || !String(i.title).trim()) errs.push(`${at}: empty title`);
    if (!TYPES.includes(i.type)) errs.push(`${at}: type "${i.type}" not one of ${TYPES.join("|")}`);
    if (!SEVERITIES.includes(i.severity))
      errs.push(`${at}: severity "${i.severity}" not one of ${SEVERITIES.join("|")}`);
    if (!STATUSES.includes(i.status))
      errs.push(`${at}: status "${i.status}" not one of ${STATUSES.join("|")}`);
    if (!SOURCES.includes(i.source))
      errs.push(`${at}: source "${i.source}" not one of ${SOURCES.join("|")}`);
    if (typeof i.requires_human !== "boolean") errs.push(`${at}: requires_human must be boolean`);
    if (typeof i.visual_pending !== "boolean") errs.push(`${at}: visual_pending must be boolean`);

    // THE rule this gate exists for. "Done" has to be backed by a stated,
    // checkable condition. Without it, completeness is prose and the gate is
    // judging vibes.
    if (i.status === "done" && !String(i.acceptance || "").trim())
      errs.push(`${at}: status is "done" but acceptance is empty — state what was proven`);
    if (i.status === "done" && !i.closed) errs.push(`${at}: status is "done" but closed is null`);
    if (i.status !== "done" && i.closed)
      errs.push(`${at}: closed is set but status is "${i.status}"`);

    // requires_human is derived, never merely declared: an item can be edited
    // by hand and this is what catches a cleared flag.
    if (needsHuman(i) && !i.requires_human)
      errs.push(
        `${at}: mentions a grant, a policy or SECURITY DEFINER, so requires_human must be true`
      );
  }

  if (typeof d.next_id !== "number") errs.push("next_id must be a number");
  else {
    const max = d.items.reduce((m, i) => {
      const n = parseInt(String(i.id || "").replace(/^RL-/, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    if (d.next_id <= max)
      errs.push(`next_id (${d.next_id}) must exceed the highest id in use (${max}) — ids are never reused`);
  }

  if (errs.length) {
    process.stderr.write("ledger: VALIDATION FAILED\n");
    for (const e of errs) process.stderr.write(`  ${e}\n`);
    process.exit(1);
  }
  process.stdout.write(`ledger: valid (${d.items.length} items)\n`);
}

// --- list -------------------------------------------------------------------
function listCmd(flags) {
  const d = load();
  let items = d.items;
  if (flags.status) items = items.filter((i) => i.status === flags.status);
  else if (!flags.all) items = items.filter((i) => i.status !== "done");

  if (flags.json) {
    process.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return;
  }
  if (!items.length) {
    process.stdout.write("(no matching items)\n");
    return;
  }
  for (const i of items) {
    const marks = [i.requires_human ? "HUMAN" : null, i.visual_pending ? "VIS?" : null]
      .filter(Boolean)
      .join(",");
    process.stdout.write(
      `${i.id}  ${String(i.severity).padEnd(8)} ${String(i.status).padEnd(11)} ${String(
        i.type
      ).padEnd(8)} ${marks ? "[" + marks + "] " : ""}${i.title}\n`
    );
  }
}

// --- add --------------------------------------------------------------------
function addCmd(flags) {
  const title = flags.title;
  const source = flags.source;
  if (!title) die("add needs --title=...");
  if (!source) die("add needs --source=...");
  if (!SOURCES.includes(source)) die(`source "${source}" not one of ${SOURCES.join("|")}`);

  const type = flags.type || "chore";
  if (!TYPES.includes(type)) die(`type "${type}" not one of ${TYPES.join("|")}`);
  let severity = flags.severity || "info";
  if (!SEVERITIES.includes(severity)) die(`severity "${severity}" not one of ${SEVERITIES.join("|")}`);
  const status = flags.status || "open";
  if (!STATUSES.includes(status)) die(`status "${status}" not one of ${STATUSES.join("|")}`);

  const draft = {
    title,
    body: flags.body || "",
    type,
    severity,
    status,
    blocked_on: flags["blocked-on"] || "",
    acceptance: flags.acceptance || "",
    source,
    requires_human: false,
    visual_pending: !!flags["visual-pending"],
    opened: today(),
    closed: null,
  };

  // Tier: refused. A reviewing agent files to findings/pending/ and stops
  // there. Promotion is a human action, so the agent cannot grant itself one.
  if (TIER_REFUSED.includes(source)) {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const file = path.join(PENDING_DIR, `${today()}-${source}-${slug || "finding"}.json`);
    draft.requires_human = true;
    fs.writeFileSync(file, JSON.stringify(draft, null, 2) + "\n");
    process.stderr.write(
      `ledger: REFUSED direct add from source "${source}".\n` +
        `        Written to ${path.relative(ROOT, file)} instead.\n` +
        `        Promotion to a ledger item is a human action — Case reviews it and\n` +
        `        runs add with --source=case if it belongs in the ledger.\n`
    );
    process.exit(3);
  }

  // Tier: demoted. A scanner reporting its own severity is not evidence.
  if (TIER_DEMOTED.includes(source) && severity !== "info") {
    process.stderr.write(
      `ledger: source "${source}" cannot set severity; "${severity}" forced to "info".\n`
    );
    severity = "info";
    draft.severity = "info";
  }

  draft.requires_human = needsHuman(draft);

  const d = load();
  const id = `RL-${String(d.next_id).padStart(3, "0")}`;
  d.next_id += 1;
  const item = { id, ...draft };
  d.items.push(item);
  save(d);
  process.stdout.write(`ledger: added ${id}${item.requires_human ? " (HUMAN-ONLY)" : ""}\n`);
}

// --- close ------------------------------------------------------------------
function closeCmd(rest, flags) {
  const id = rest[0];
  if (!id) die("close needs an id, e.g. close RL-004");
  const d = load();
  const item = d.items.find((i) => i.id === id);
  if (!item) die(`no item with id ${id}`);
  if (flags.acceptance) item.acceptance = flags.acceptance;
  if (!String(item.acceptance || "").trim())
    die(`${id} has no acceptance criterion — pass --acceptance="..." stating what was proven`);
  item.status = "done";
  item.closed = today();
  save(d);
  process.stdout.write(`ledger: closed ${id}\n`);
}

// --- main -------------------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = argv[0];
const { flags, rest } = args(argv.slice(1));

switch (cmd) {
  case "list":
    listCmd(flags);
    break;
  case "add":
    addCmd(flags);
    break;
  case "close":
    closeCmd(rest, flags);
    break;
  case "render":
    renderCmd(flags);
    break;
  case "validate":
    validateCmd();
    break;
  default:
    process.stderr.write(
      "usage: ledger.js <list|add|close|render|validate> [flags]\n" +
        "  list     [--all] [--status=open] [--json]\n" +
        "  add      --title= --source= [--type=] [--severity=] [--body=]\n" +
        "           [--acceptance=] [--blocked-on=] [--status=] [--visual-pending]\n" +
        "  close    RL-00N [--acceptance=]\n" +
        "  render   [--check]   regenerate the NEXT-SESSION.md table from the ledger\n" +
        "  validate             non-zero if any done item has no acceptance\n"
    );
    process.exit(cmd ? 1 : 0);
}
