import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

const ID = "00000000-0000-0000-0000-000000000000";
const json = { "Content-Type": "application/json" };

describe("Team formation API requires a session", () => {
  it.each([
    ["GET", "/api/me/contact"],
    ["PUT", "/api/me/contact"],
    ["GET", "/api/me/requests"],
    ["GET", "/api/participants/looking"],
    ["POST", `/api/teams/${ID}/invitations`],
    ["POST", `/api/teams/${ID}/requests`],
    ["PATCH", `/api/requests/${ID}`],
  ])("%s %s returns 401 when not authenticated", async (method, path) => {
    const res = await fetch(path, {
      method,
      headers: json,
      body: method === "GET" ? undefined : JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("the contact confirmation is admin-only", async () => {
    const res = await fetch(`/api/admin/registrations/${ID}/contact-confirm`, {
      method: "POST",
      headers: json,
      body: "{}",
    });
    expect(res.status).toBe(401);
  });
});
