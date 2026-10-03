import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { escapeCsvCell, toCsv } from "../../server/utils/csv";
import { buildSponsorReport, suppressSmallGroups } from "../../server/utils/suppression";
import { hasVerifiedMfa } from "../../server/utils/mfa";
import { retentionAlert } from "../../server/utils/retentionMonitor";

describe("CSV export escaping", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const value of ["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(escapeCsvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("quotes separators and joins arrays", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell(["Go", "Rust"])).toBe("Go; Rust");
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\n1,");
  });
});

describe("small-group suppression", () => {
  it("hides counts below the threshold", () => {
    const t = suppressSmallGroups(
      [{ key: "a", count: 10 }, { key: "b", count: 2 }, { key: "c", count: 3 }],
      5,
    );
    expect(t.cells.map((c) => c.count)).toEqual([10, null, null]);
    expect(t.total).toBe(15);
  });

  it("hides a second cell so a lone suppressed count cannot be recovered from the total", () => {
    const t = suppressSmallGroups(
      [{ key: "a", count: 10 }, { key: "b", count: 7 }, { key: "c", count: 2 }],
      5,
    );
    expect(t.cells.filter((c) => c.count === null)).toHaveLength(2);
    const visible = t.cells.reduce((s, c) => s + (c.count ?? 0), 0);
    expect(t.total! - visible).toBe(9); // the sum of two hidden cells, not one person-level value
  });

  it("withholds everything when the whole group is small", () => {
    const t = suppressSmallGroups([{ key: "a", count: 2 }, { key: "b", count: 1 }], 5);
    expect(t.total).toBeNull();
    expect(t.cells.every((c) => c.count === null)).toBe(true);
  });
});

describe("admin exports and reports require an admin", () => {
  for (const path of [
    "/api/admin/participants/export",
    "/api/admin/teams/export",
    "/api/admin/catering/export",
    "/api/admin/sponsors",
    "/api/admin/sponsors/50000000-0000-0000-0000-000000000001/export",
    "/api/admin/sponsors/report",
    "/api/admin/sources/report",
    "/api/admin/sources/export?kind=sources",
    "/api/admin/sources/links",
    "/api/admin/exports",
  ]) {
    it(`GET ${path} returns 401 unauthenticated`, async () => {
      const res = await fetch(path);
      expect(res.status).toBe(401);
    });
  }

  it("POST /api/admin/participants/:id/sponsor-objection returns 401 unauthenticated", async () => {
    const res = await fetch("/api/admin/participants/x/sponsor-objection", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("sponsor report suppression across combinations", () => {
  const LEVELS = ["beginner", "intermediate", "experienced", null] as const;
  const MIN = 5;

  // Every distribution of up to 14 people over the four experience groups.
  function* distributions(): Generator<number[]> {
    for (let a = 0; a <= 14; a++)
      for (let b = 0; a + b <= 14; b++)
        for (let c = 0; a + b + c <= 14; c++)
          for (let d = 0; a + b + c + d <= 14; d++) yield [a, b, c, d];
  }

  it("never leaves exactly one small group recoverable from the total and the visible cells", () => {
    let checked = 0;
    for (const counts of distributions()) {
      const rows = counts.flatMap((n, i) => Array.from({ length: n }, () => ({ skills: [], experience: LEVELS[i] })));
      const report = buildSponsorReport(rows, MIN);
      checked++;
      for (const [i, cell] of report.experience.entries()) {
        if (cell.count !== null) {
          // Every visible non-zero count meets the threshold.
          expect(cell.count === 0 || cell.count >= MIN).toBe(true);
        }
        void i;
      }
      const hidden = report.experience.filter((c) => c.count === null);
      if (report.total !== null) {
        // With a visible total, a single hidden cell would equal total − visible.
        expect(hidden.length).not.toBe(1);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("withholds the total when the whole edition is a small group", () => {
    const report = buildSponsorReport([{ skills: ["go"], experience: "beginner" }], MIN);
    expect(report.total).toBeNull();
    expect(report.skills).toEqual([]);
  });

  it("shows a skill only when enough people share it, regardless of how skills overlap", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ skills: ["Go", "Rust"], experience: "beginner" })),
      ...Array.from({ length: 2 }, () => ({ skills: ["Rust", "COBOL"], experience: "experienced" })),
    ];
    const report = buildSponsorReport(rows, MIN);
    expect(report.skills).toEqual([
      { skill: "rust", participants: 8 },
      { skill: "go", participants: 6 },
    ]);
  });

  it("is deterministic, so repeated exports of a final edition are identical", () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({
      skills: [`s${i % 4}`, "go"],
      experience: LEVELS[i % 4],
    }));
    expect(buildSponsorReport(rows, MIN)).toEqual(buildSponsorReport([...rows].reverse(), MIN));
  });
});

describe("MFA for exports", () => {
  it("accepts only an aal2 session", () => {
    expect(hasVerifiedMfa({ aal: "aal2" })).toBe(true);
    expect(hasVerifiedMfa({ aal: "aal1" })).toBe(false);
    expect(hasVerifiedMfa({})).toBe(false);
    expect(hasVerifiedMfa(null)).toBe(false);
    expect(hasVerifiedMfa({ aal: ["aal2"] })).toBe(false);
  });
});

describe("retention monitor", () => {
  const now = new Date("2026-10-20T07:00:00Z");

  it("is quiet after a recent run", () => {
    expect(retentionAlert("2026-10-20T03:17:00Z", now)).toBeNull();
  });

  it("alerts when the job never ran or is overdue", () => {
    expect(retentionAlert(null, now)).toMatch(/never run/);
    expect(retentionAlert("2026-10-19T03:17:00Z", now)).toMatch(/last ran/);
    expect(retentionAlert("garbage", now)).toMatch(/last ran/);
  });
});

describe("short links are rate limited and leak nothing", () => {
  it("/go/* responses are not cacheable and carry no identifier", async () => {
    const res = await fetch("/go/poster-fmi", { redirect: "manual" });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
