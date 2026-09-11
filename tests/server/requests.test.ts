import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { useFixture } from "../fixture";

describe("Join Requests API", async () => {
  await useFixture();

  it("POST /api/teams/:id/requests returns 401 unauthenticated", async () => {
    const res = await fetch(
      "/api/teams/00000000-0000-0000-0000-000000000000/requests",
      { method: "POST" }
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /api/requests/:id returns 401 unauthenticated", async () => {
    const res = await fetch(
      "/api/requests/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }
    );
    expect(res.status).toBe(401);
  });
});
