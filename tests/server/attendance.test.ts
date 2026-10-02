import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

const json = { "Content-Type": "application/json" };
describe("attendance API authorization", () => {
  it.each([
    ["GET", "/api/me/attendance"],
    ["POST", "/api/me/attendance/intention"],
    ["POST", "/api/me/attendance/seat"],
    ["GET", "/api/admin/attendance"],
    ["POST", "/api/admin/attendance/checkin"],
    ["POST", "/api/admin/attendance/outreach"],
    ["POST", "/api/admin/attendance/expire"],
    ["POST", "/api/admin/attendance/snapshot"],
    ["GET", "/api/admin/attendance/config"],
    ["PATCH", "/api/admin/attendance/config"],
    ["POST", "/api/admin/attendance/queue"],
  ])("%s %s requires a session", async (method, path) => {
    const result = await fetch(path, { method, headers: json,
      body: method === "GET" ? undefined : "{}" });
    expect(result.status).toBe(401);
  });
});
