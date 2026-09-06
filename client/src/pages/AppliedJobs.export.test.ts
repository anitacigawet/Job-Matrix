// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportToCSV } from "./AppliedJobs";
import { serializeCsv } from "@shared/csv";

describe("Applications CSV download", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("exports the real download with neutralized formulas and correctly escaped notes", () => {
    let downloaded = "";
    vi.stubGlobal("Blob", class { constructor(parts: string[]) { downloaded = parts.join(""); } });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fixture", revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const date = new Date("2026-08-01T12:00:00Z");
    exportToCSV([{ title: "=1+1", company: '+SUM(A1:A2)', location: '@location', salaryMin: null,
      salaryMax: null, jobType: 'Full "time"', applicationStatus: "applied", appliedAt: date,
      notes: '\t=1+1\nHe said "hello", then left.', jobUrl: "https://example.test/job" }]);
    expect(downloaded).toBe(serializeCsv([
      ["Title", "Company", "Location", "Salary", "Job Type", "Status", "Applied Date", "Notes", "Job URL"],
      ["=1+1", "+SUM(A1:A2)", "@location", "N/A", 'Full "time"', "applied", date.toLocaleDateString(), '\t=1+1\nHe said "hello", then left.', "https://example.test/job"],
    ]));
    expect(downloaded).toContain('"\'=1+1"');
    expect(downloaded).toContain('He said ""hello"", then left.');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
  });
});
