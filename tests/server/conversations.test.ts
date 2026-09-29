import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

const ID = "00000000-0000-0000-0000-000000000000";
const json = { "Content-Type": "application/json" };

describe("Phase 2 routes require a session", () => {
  it.each([
    ["GET", "/api/recommendations/teams"],
    ["GET", "/api/recommendations/candidates"],
    ["POST", "/api/recommendations/dismiss"],
    ["POST", "/api/me/help"],
    ["GET", "/api/me/conversations"],
    ["GET", "/api/me/proposals"],
    ["GET", "/api/me/blocks"],
    ["DELETE", `/api/me/blocks/${ID}`],
    ["PATCH", `/api/proposals/${ID}`],
    ["GET", `/api/conversations/${ID}/messages`],
    ["POST", `/api/conversations/${ID}/messages`],
    ["POST", `/api/conversations/${ID}/read`],
    ["POST", `/api/conversations/${ID}/reports`],
    ["POST", `/api/conversations/${ID}/block`],
  ])("%s %s returns 401 when not authenticated", async (method, path) => {
    const res = await fetch(path, {
      method,
      headers: json,
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    expect(res.status).toBe(401);
  });

  it.each([
    ["GET", "/api/admin/matching/queue"],
    ["GET", "/api/admin/proposals"],
    ["POST", "/api/admin/proposals"],
    ["DELETE", `/api/admin/proposals/${ID}`],
    ["GET", "/api/admin/reports"],
    ["GET", `/api/admin/reports/${ID}`],
    ["PATCH", `/api/admin/reports/${ID}`],
  ])("admin %s %s returns 401 when not authenticated", async (method, path) => {
    const res = await fetch(path, {
      method,
      headers: json,
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    expect(res.status).toBe(401);
  });
});
