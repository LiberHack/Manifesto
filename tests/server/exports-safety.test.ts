import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { escapeCsvCell, toCsv } from "../../server/utils/csv";
import { suppressSmallGroups } from "../../server/utils/suppression";

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
