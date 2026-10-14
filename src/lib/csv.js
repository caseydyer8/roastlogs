// CSV cell escaping for the roast-log export (handleExportCSV in App.js).
//
// RL-050: a spreadsheet RUNS a text cell that opens with = + - @ (or a TAB or CR)
// as a formula. A note like "+15s dev" shows up as #NAME?, and a bean named
// =cmd|'/c calc'!A1 is a command waiting to be run. The defence is a leading
// single quote on such a TEXT cell (the OWASP-recommended one): the spreadsheet
// shows the text as typed and does not evaluate it.
//
// It is decided by the value's TYPE, not by what its characters look like. A
// number is not text and is written as it is, so a real -5.0 stays a number; a
// string that merely LOOKS like a number is still text and gets the quote.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export const csvEscape = (val) => {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return String(val);
  let s = String(val);
  // Prefix BEFORE quoting, so the quote rides inside the quoted cell when both apply.
  if (FORMULA_LEAD.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
