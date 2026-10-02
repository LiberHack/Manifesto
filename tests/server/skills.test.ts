import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("Skills API", () => {
  it("GET /api/skills is public", async () => {
    const res = await fetch("/api/skills");
    expect(res.status).toBe(200);
  });

  it("POST /api/skills returns 401 when not authenticated", async () => {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Zig" }),
    });
    expect(res.status).toBe(401);
  });
});
