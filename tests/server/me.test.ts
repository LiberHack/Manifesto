import { describe, it, expect } from "vitest";
import { setup, $fetch } from "@nuxt/test-utils/e2e";

describe("GET /api/me", async () => {
  await setup({ server: true });

  it("returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/me");
    expect(res.status).toBe(401);
  });
});
