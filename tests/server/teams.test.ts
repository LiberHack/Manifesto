import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("Teams API", async () => {
  await setup({ server: true });

  it("GET /api/teams returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams");
    expect(res.status).toBe(401);
  });

  it("POST /api/teams returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Team Punk", skills_wanted: ["TypeScript"] }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/teams/:id returns 401 when not authenticated", async () => {
    const res = await fetch("http://localhost:3000/api/teams/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });
});
