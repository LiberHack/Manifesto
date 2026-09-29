import { describe, it, expect } from "vitest";
import { fromSofiaLocal, toSofiaLocal } from "~/utils/sofiaTime";

// The admin panel runs in whatever timezone the admin's browser is in; these
// must not depend on it. The suite's own timezone is irrelevant to the maths.
describe("fromSofiaLocal", () => {
  it("converts summer wall-clock time (EEST, UTC+3)", () => {
    expect(fromSofiaLocal("2026-09-29T12:00")).toBe("2026-09-29T09:00:00.000Z");
  });

  it("converts winter wall-clock time (EET, UTC+2)", () => {
    expect(fromSofiaLocal("2026-12-01T12:00")).toBe("2026-12-01T10:00:00.000Z");
  });

  it("handles the hours either side of the autumn DST change", () => {
    // Clocks go back 04:00 EEST -> 03:00 EET on 2026-10-25.
    expect(fromSofiaLocal("2026-10-25T02:00")).toBe("2026-10-24T23:00:00.000Z");
    expect(fromSofiaLocal("2026-10-25T05:00")).toBe("2026-10-25T03:00:00.000Z");
  });

  it("returns an empty string for empty input", () => {
    expect(fromSofiaLocal("")).toBe("");
  });
});

describe("toSofiaLocal", () => {
  it("formats a UTC instant as a Sofia datetime-local value", () => {
    expect(toSofiaLocal("2026-09-29T09:00:00.000Z")).toBe("2026-09-29T12:00");
  });

  it("round-trips with fromSofiaLocal", () => {
    for (const local of ["2026-03-01T08:15", "2026-07-15T23:45"]) {
      expect(toSofiaLocal(fromSofiaLocal(local))).toBe(local);
    }
  });

  it("returns an empty string for null", () => {
    expect(toSofiaLocal(null)).toBe("");
  });
});
