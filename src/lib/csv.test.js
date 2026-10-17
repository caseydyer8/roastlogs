import { csvEscape } from "./csv";

// RL-050: the CSV export writes free text (bean name, origin, notes...) into cells,
// and a spreadsheet RUNS a text cell that opens with = + - @ (or a TAB or CR) as a
// formula. The defence is a leading single quote on those text cells, applied
// BEFORE the usual quoting, so the quote rides inside the quoted cell when both are
// needed. A number (e.g. Rating) passes through as it is: csvEscape decides by the
// value's TYPE, not by what its characters look like. The Weight Loss % column is a
// computed toFixed string, so it is exempted at the call site in App.js.
describe("csvEscape: formula prefixes", () => {
  it("prefixes a ' to text that opens with =, +, - or @", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+15s dev")).toBe("'+15s dev");
    expect(csvEscape("-1 heat at FC")).toBe("'-1 heat at FC");
    expect(csvEscape("@x")).toBe("'@x");
    expect(csvEscape("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  it("prefixes text that opens with a TAB (and quotes one that opens with a CR)", () => {
    expect(csvEscape("\t=1+1")).toBe("'\t=1+1");
    // A CR is also a line break to a CSV reader, so the cell is quoted as well.
    expect(csvEscape("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("only looks at the FIRST character: the same characters inside text are left alone", () => {
    for (const text of ["a=b", "1+1", "x-ray", "name@host", "Fan 5 - Heat 6", "2026-08-01"]) {
      expect(csvEscape(text)).toBe(text);
    }
  });

  it("applies the prefix before quoting, so both can apply to one cell", () => {
    expect(csvEscape("=A1,B1")).toBe('"\'=A1,B1"');
    expect(csvEscape('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvEscape("-1 heat,\nthen +2 fan")).toBe('"\'-1 heat,\nthen +2 fan"');
  });
});

describe("csvEscape: type decides, not look", () => {
  it("treats a numeric-looking STRING as text", () => {
    // A string that merely reads like a number is still text: it gets the quote. This is
    // why the exporter's computed Weight Loss % string ("-5.0") is exempted at the call
    // site in App.js instead of being passed through here.
    expect(csvEscape("-1.5")).toBe("'-1.5");
    expect(csvEscape("-5.0")).toBe("'-5.0");
    // The number itself is written as it is: the text that lands in the file is -1.5.
    expect(csvEscape(-1.5)).toBe("-1.5");
  });
});

describe("csvEscape: the ordinary rules still hold", () => {
  it("leaves plain text alone", () => {
    expect(csvEscape("Ethiopia Guji")).toBe("Ethiopia Guji");
    expect(csvEscape("")).toBe("");
  });

  it("quotes text with a comma, a quote or a line break, and doubles inner quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line one\nline two")).toBe('"line one\nline two"');
    expect(csvEscape("line one\rline two")).toBe('"line one\rline two"');
    expect(csvEscape("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("passes a number through untouched, negative or not", () => {
    expect(csvEscape(5)).toBe("5");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(98.6)).toBe("98.6");
    expect(csvEscape(-1.5)).toBe("-1.5");
    expect(csvEscape(-15)).toBe("-15");
  });

  it("writes null and undefined as an empty cell", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});
