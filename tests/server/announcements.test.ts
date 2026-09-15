import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import {
  shouldShowAnnouncement,
  sortAnnouncements,
  type Announcement,
} from "~/composables/useAnnouncementAudience";
import { readAnnouncementBody } from "../../server/utils/announcementInput";
import type { Me } from "~/composables/useMe";

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "a1",
    channel: "ops",
    audience: "all",
    variant: "info",
    body: "Something happened",
    href: null,
    dismissible: true,
    sort_order: 1,
    ...overrides,
  };
}

function viewer(registration: Partial<NonNullable<Me["registration"]>> | null): Me {
  return {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "participant",
    created_at: "2026-01-01T00:00:00.000Z",
    edition: null,
    team: null,
    registration: registration
      ? {
          id: "reg-1",
          role: "participant",
          team_id: null,
          skills: [],
          dietary: "none",
          experience: "beginner",
          public: true,
          accepted_terms_at: "2026-01-01T00:00:00.000Z",
          registered_at: "2026-01-01T00:00:00.000Z",
          ...registration,
        }
      : null,
  } as Me;
}

describe("shouldShowAnnouncement", () => {
  it("shows site rows to everyone, signed in or not, on any route", () => {
    const row = announcement({ channel: "site" });
    expect(shouldShowAnnouncement(row, null, false)).toBe(true);
    expect(shouldShowAnnouncement(row, viewer(null), false)).toBe(true);
    expect(shouldShowAnnouncement(row, viewer({}), true)).toBe(true);
  });

  it("hides ops rows outside /ops", () => {
    expect(shouldShowAnnouncement(announcement(), viewer({}), false)).toBe(false);
  });

  it("hides ops rows from a spectator with no registration", () => {
    expect(shouldShowAnnouncement(announcement(), viewer(null), true)).toBe(false);
    expect(shouldShowAnnouncement(announcement(), null, true)).toBe(false);
  });

  it("shows audience 'all' to any registered viewer", () => {
    expect(shouldShowAnnouncement(announcement(), viewer({}), true)).toBe(true);
  });

  it("shows audience 'leaders' only to leaders", () => {
    const row = announcement({ audience: "leaders" });
    expect(shouldShowAnnouncement(row, viewer({ role: "leader" }), true)).toBe(true);
    expect(shouldShowAnnouncement(row, viewer({ role: "participant" }), true)).toBe(false);
  });

  it("shows audience 'no_team' only to the teamless", () => {
    const row = announcement({ audience: "no_team" });
    expect(shouldShowAnnouncement(row, viewer({ team_id: null }), true)).toBe(true);
    expect(shouldShowAnnouncement(row, viewer({ team_id: "t1" }), true)).toBe(false);
  });

  it("shows audience 'missing_profile' when dietary or experience is unset", () => {
    const row = announcement({ audience: "missing_profile" });
    expect(shouldShowAnnouncement(row, viewer({ dietary: null }), true)).toBe(true);
    expect(shouldShowAnnouncement(row, viewer({ experience: null }), true)).toBe(true);
    expect(
      shouldShowAnnouncement(row, viewer({ dietary: "none", experience: "beginner" }), true),
    ).toBe(false);
  });

  it("never renders live rows as banners", () => {
    const row = announcement({ channel: "live" });
    expect(shouldShowAnnouncement(row, viewer({}), true)).toBe(false);
  });
});

describe("sortAnnouncements", () => {
  it("orders site before ops, then by sort_order", () => {
    const rows = [
      announcement({ id: "ops-2", channel: "ops", sort_order: 2 }),
      announcement({ id: "site-2", channel: "site", sort_order: 2 }),
      announcement({ id: "ops-1", channel: "ops", sort_order: 1 }),
      announcement({ id: "site-1", channel: "site", sort_order: 1 }),
    ];
    expect(sortAnnouncements(rows).map((r) => r.id)).toEqual([
      "site-1",
      "site-2",
      "ops-1",
      "ops-2",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [
      announcement({ id: "ops-1", channel: "ops" }),
      announcement({ id: "site-1", channel: "site" }),
    ];
    sortAnnouncements(rows);
    expect(rows.map((r) => r.id)).toEqual(["ops-1", "site-1"]);
  });
});

describe("readAnnouncementBody", () => {
  it("requires a body on create", () => {
    expect(() => readAnnouncementBody({}, { requireBody: true })).toThrow();
    expect(() => readAnnouncementBody({ body: "   " }, { requireBody: true })).toThrow();
  });

  it("allows a partial update without a body", () => {
    expect(readAnnouncementBody({ active: false }, { requireBody: false })).toEqual({
      active: false,
    });
  });

  it("rejects unknown enum values", () => {
    expect(() =>
      readAnnouncementBody({ body: "x", channel: "email" }, { requireBody: true }),
    ).toThrow();
    expect(() =>
      readAnnouncementBody({ body: "x", audience: "admins" }, { requireBody: true }),
    ).toThrow();
    expect(() =>
      readAnnouncementBody({ body: "x", variant: "danger" }, { requireBody: true }),
    ).toThrow();
  });

  it("accepts internal paths and http(s) URLs as href", () => {
    expect(readAnnouncementBody({ href: "/ops/dashboard" }, { requireBody: false }).href).toBe(
      "/ops/dashboard",
    );
    expect(readAnnouncementBody({ href: "https://x.test/a" }, { requireBody: false }).href).toBe(
      "https://x.test/a",
    );
    expect(readAnnouncementBody({ href: "" }, { requireBody: false }).href).toBeNull();
  });

  it("rejects an href that could execute script or leave for a bare host", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.test"]) {
      expect(() => readAnnouncementBody({ href }, { requireBody: false })).toThrow();
    }
  });

  it("rejects a window that ends before it starts", () => {
    expect(() =>
      readAnnouncementBody(
        { starts_at: "2027-01-02T00:00:00Z", ends_at: "2027-01-01T00:00:00Z" },
        { requireBody: false },
      ),
    ).toThrow();
  });

  it("drops server-owned fields", () => {
    const out = readAnnouncementBody(
      { body: "x", sort_order: 99, edition_slug: "2099", id: "spoofed" },
      { requireBody: true },
    );
    expect(out).toEqual({ body: "x" });
  });
});

describe("Announcements API", () => {
  it("GET /api/announcements is public", async () => {
    const res = await fetch("/api/announcements");
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/live/announcements returns 401 unauthenticated", async () => {
    const res = await fetch("/api/admin/live/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "hi", channel: "site" }),
    });
    expect(res.status).toBe(401);
  });
});
