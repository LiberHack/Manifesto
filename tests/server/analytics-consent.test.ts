import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createEvent } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAnalyticsChoice } from "../../shared/utils/privacy";
import {
  isAcquisitionLanding,
  landingToRecordOnConsent,
  readAnalyticsChoice,
  trackIfGranted,
} from "../../app/utils/analyticsClient";
import { analyticsActivationAllowed, recordRegistrationCompleted } from "../../server/utils/analytics";

const BROWSER = "b0000000-0000-0000-0000-000000000001";
const REGISTRATION = "e0000000-0000-0000-0000-000000000001";
const NOW = Date.parse("2026-10-20T12:00:00Z");

describe("analytics choice cookie", () => {
  it("reads granted with its expiry, denied, and nothing", () => {
    expect(parseAnalyticsChoice(`granted.${NOW + 1000}`, NOW)).toEqual({ state: "granted", expiresAt: NOW + 1000 });
    expect(parseAnalyticsChoice("denied", NOW)).toEqual({ state: "denied" });
    expect(parseAnalyticsChoice(undefined, NOW)).toEqual({ state: "unset" });
    expect(parseAnalyticsChoice("granted.nonsense", NOW)).toEqual({ state: "unset" });
  });

  it("treats an expired grant as unanswered so the banner asks again", () => {
    expect(parseAnalyticsChoice(`granted.${NOW - 1}`, NOW)).toEqual({ state: "unset" });
  });

  it("parses it out of a cookie header", () => {
    expect(readAnalyticsChoice(`a=1; lh_analytics=denied; b=2`, NOW).state).toBe("denied");
  });
});

describe("no analytics without consent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("sends nothing and stores nothing before consent or after rejection", () => {
    const send = vi.fn(() => Promise.resolve());
    const cookieBefore = document.cookie;

    expect(trackIfGranted({ state: "unset" }, "landing_viewed", send, { src: "poster-fmi" })).toBe(false);
    expect(trackIfGranted({ state: "denied" }, "registration_cta_clicked", send)).toBe(false);

    expect(send).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe(cookieBefore);
  });

  it("sends only the event, tag and referrer host once granted", () => {
    const send = vi.fn(() => Promise.resolve());
    trackIfGranted({ state: "granted", expiresAt: Date.now() + 1000 }, "landing_viewed", send, {
      src: "poster-fmi",
      refHost: "l.instagram.com",
    });
    expect(send).toHaveBeenCalledWith({ event: "landing_viewed", src: "poster-fmi", ref_host: "l.instagram.com" });
  });

  it("swallows a failed request so it cannot break the page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(() => Promise.reject(new Error("offline")));
    expect(() => trackIfGranted({ state: "granted", expiresAt: Date.now() + 1000 }, "registration_started", send)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

function eventWithCookie(cookie?: string) {
  const req = new IncomingMessage(new Socket());
  if (cookie) req.headers.cookie = cookie;
  return createEvent(req, new ServerResponse(req));
}

function fakeSupabase(rpc: (name: string) => { data: unknown; error: unknown } | Promise<never>) {
  const calls: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
  const client = {
    rpc: vi.fn(async (name: string) => {
      calls.push(name);
      return rpc(name);
    }),
    from: () => query,
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("consent-time landing", () => {
  const landing = { path: "/", src: "poster-fmi", refHost: "l.instagram.com" };

  it("records the landing page the visitor is still on when they allow", () => {
    expect(landingToRecordOnConsent(landing, "/")).toEqual(landing);
  });

  it("does not count the email confirmation hop as a landing", () => {
    // Clicking the link in Gmail sends referrer mail.google.com; counting it
    // would replace an Instagram last touch with ref-google.
    expect(isAcquisitionLanding("/ops/confirm")).toBe(false);
    expect(isAcquisitionLanding("/ops/reset-password")).toBe(false);
    expect(isAcquisitionLanding("/")).toBe(true);
    expect(isAcquisitionLanding("/ops/register")).toBe(true);
  });

  it("does not reconstruct the landing after the visitor navigated away", () => {
    expect(landingToRecordOnConsent(landing, "/ops/register")).toBeNull();
    expect(landingToRecordOnConsent(null, "/")).toBeNull();
  });

  it("sends no timestamp, so the server stamps consent time and nothing is backdated", () => {
    const send = vi.fn(() => Promise.resolve());
    trackIfGranted({ state: "granted", expiresAt: Date.now() + 1000 }, "landing_viewed", send, landing);
    const sent = (send.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(Object.keys(sent).toSorted()).toEqual(["event", "ref_host", "src"]);
  });
});

describe("server-side registration completion", () => {
  it("records nothing without the consent cookie", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: true, error: null }));
    await recordRegistrationCompleted(eventWithCookie(), client, "2027", REGISTRATION);
    expect(calls).toEqual([]);
  });

  it("writes completion and attribution in one call keyed by the registration", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: true, error: null }));
    await recordRegistrationCompleted(eventWithCookie(`lh_aid=${BROWSER}`), client, "2027", REGISTRATION);
    expect(calls).toEqual(["analytics_complete_registration"]);
    expect(client.rpc).toHaveBeenCalledWith(
      "analytics_complete_registration",
      expect.objectContaining({
        p_browser: BROWSER,
        p_edition: "2027",
        p_registration: REGISTRATION,
        p_first: "unknown",
        p_last: "unknown",
      }),
    );
  });

  it("is gated by the server-side activation flag, off by default", () => {
    expect(analyticsActivationAllowed({})).toBe(false);
    expect(analyticsActivationAllowed({ analyticsActivationAllowed: "true" })).toBe(false);
    expect(analyticsActivationAllowed({ analyticsActivationAllowed: true })).toBe(true);
  });

  it("never throws when analytics fails, so registration still succeeds", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = fakeSupabase(() => Promise.reject(new Error("db down")));
    await expect(
      recordRegistrationCompleted(eventWithCookie(`lh_aid=${BROWSER}`), failing.client, "2027", REGISTRATION),
    ).resolves.toBeUndefined();
    const erroring = fakeSupabase(() => ({ data: null, error: { message: "boom" } }));
    await expect(
      recordRegistrationCompleted(eventWithCookie(`lh_aid=${BROWSER}`), erroring.client, "2027", REGISTRATION),
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it("ignores a malformed id cookie", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: true, error: null }));
    await recordRegistrationCompleted(eventWithCookie("lh_aid=not-a-uuid"), client, "2027", REGISTRATION);
    expect(calls).toEqual([]);
  });
});

describe("analytics API", () => {
  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("an event without the consent cookie is a no-op that sets no cookie", async () => {
    const res = await post("/api/analytics/event", { event: "landing_viewed", src: "poster-fmi" });
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects undefined events and client-sent completion", async () => {
    expect((await post("/api/analytics/event", { event: "page_scrolled" })).status).toBe(400);
    expect((await post("/api/analytics/event", { event: "registration_completed" })).status).toBe(400);
  });

  it("rejects oversized payloads", async () => {
    const res = await post("/api/analytics/event", { event: "landing_viewed", ref_host: "x".repeat(1000) });
    expect(res.status).toBe(413);
  });

  it("does not record when analytics is off for the edition, even with a cookie", async () => {
    const res = await post("/api/analytics/event", { event: "landing_viewed" }, `lh_aid=${BROWSER}`);
    expect(res.status).toBe(204);
  });

  it("validates the consent decision", async () => {
    expect((await post("/api/analytics/consent", { decision: "maybe" })).status).toBe(400);
  });

  it("refuses to mint an id while analytics is off", async () => {
    const res = await post("/api/analytics/consent", { decision: "granted" });
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("lh_aid=b");
  });

  it("remembers a rejection without creating an id", async () => {
    const res = await post("/api/analytics/consent", { decision: "denied" });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("lh_analytics=denied");
    expect(cookies).not.toMatch(/lh_aid=[0-9a-f]/);
  });

  it("withdrawal works without an account and clears the id cookie", async () => {
    const res = await fetch("/api/analytics/consent", {
      method: "DELETE",
      headers: { cookie: `lh_aid=${BROWSER}` },
    });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/lh_aid=;.*Max-Age=0/i);
    expect(cookies).toMatch(/HttpOnly/i);
  });
});

describe("short links", () => {
  for (const tag of ["unknown-tag", "ref-instagram", "Bad%20Tag", "x"]) {
    it(`/go/${tag} redirects to the homepage without a tag`, async () => {
      const res = await fetch(`/go/${tag}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });
  }
});

describe("account privacy routes require a session", () => {
  it("GET /api/me/privacy returns 401", async () => {
    expect((await fetch("/api/me/privacy")).status).toBe(401);
  });
  it("POST /api/me/privacy returns 401", async () => {
    expect((await fetch("/api/me/privacy", { method: "POST" })).status).toBe(401);
  });
});
