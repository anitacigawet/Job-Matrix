import { describe, expect, it } from "vitest";
import { encodeCsvCell, serializeCsv } from "./csv";

describe("spreadsheet-safe CSV cells", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-1+1", "@SUM(A1:A2)", "\t=1", "\r\n+1", " \uFEFF\u200B@x", "\u202E-1", "＝1+1", "＋1", "＠x", "－1"])("neutralizes untrusted formula text %j", value => {
    expect(encodeCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
  });

  it("quotes separators, multiline notes, quotes and empty values exactly once", () => {
    expect(serializeCsv([["Title", "Notes"], ['A, "B"', 'First\r\nSecond "line"']]))
      .toBe('"Title","Notes"\r\n"A, ""B""","First\r\nSecond ""line"""');
    expect(serializeCsv([[null, undefined, "", false, "ordinary text"]]))
      .toBe('"","","","false","ordinary text"');
  });

  it("preserves real finite numeric values including zero and negatives", () => {
    expect(serializeCsv([[0, -42, 12.5]])).toBe("0,-42,12.5");
    expect(encodeCsvCell("-42")).toBe('"\'-42"');
    for (const value of [NaN, Infinity, -Infinity]) expect(() => encodeCsvCell(value)).toThrow("finite");
  });
});
