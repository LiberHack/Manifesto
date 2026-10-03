import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("Skills API", () => {
  it("GET /api/skills is public", async () => {
    const res = await fetch("/api/skills");
    expect(res.status).toBe(200);
  });
});
