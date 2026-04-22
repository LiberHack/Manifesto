import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("Admin API", async () => {
  await setup({ server: true });

  it("GET /api/admin/participants returns 401 unauthenticated", async () => {
    const res = await fetch("http://localhost:3000/api/admin/participants");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/teams returns 401 unauthenticated", async () => {
    const res = await fetch("http://localhost:3000/api/admin/teams");
    expect(res.status).toBe(401);
  });
});
