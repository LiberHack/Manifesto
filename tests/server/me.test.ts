import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("GET /api/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await fetch("/api/me");
    expect(res.status).toBe(401);
  });
});
