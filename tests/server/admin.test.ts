import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("Admin API", () => {
  it("GET /api/admin/participants returns 401 unauthenticated", async () => {
    const res = await fetch("/api/admin/participants");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/teams returns 401 unauthenticated", async () => {
    const res = await fetch("/api/admin/teams");
    expect(res.status).toBe(401);
  });
});
