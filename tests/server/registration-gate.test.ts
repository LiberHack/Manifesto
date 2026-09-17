import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { isRegistrationExempt } from "~/utils/registrationGate";

describe("Registration gate — exempt routes", () => {
  it("exempts the registration page itself", () => {
    expect(isRegistrationExempt("/ops/register-edition")).toBe(true);
    expect(isRegistrationExempt("/ops/register-edition?next=/ops/teams")).toBe(
      true,
    );
  });

  it("exempts the auth flow pages", () => {
    for (const path of [
      "/ops/login",
      "/ops/verify-email",
      "/ops/confirm",
      "/ops/forgot-password",
      "/ops/reset-password",
    ]) {
      expect(isRegistrationExempt(path)).toBe(true);
    }
  });

  it("gates every edition-scoped page", () => {
    for (const path of [
      "/ops/dashboard",
      "/ops/teams",
      "/ops/teams/abc",
      "/ops/team/create",
      "/ops/invite/abc123",
      "/ops/admin",
    ]) {
      expect(isRegistrationExempt(path)).toBe(false);
    }
  });
});

describe("Registration API", () => {
  it("GET /api/me/registration returns 401 when not authenticated", async () => {
    const res = await fetch("/api/me/registration");
    expect(res.status).toBe(401);
  });

  it("POST /api/me/registration returns 401 when not authenticated", async () => {
    const res = await fetch("/api/me/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience: "beginner", accepted_terms: true }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Editions admin API", () => {
  it("GET /api/admin/editions returns 401 when not authenticated", async () => {
    const res = await fetch("/api/admin/editions");
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/editions returns 401 when not authenticated", async () => {
    const res = await fetch("/api/admin/editions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "2027", name: "LiberHack 2027" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/editions/:slug/go-live returns 401 when not authenticated", async () => {
    const res = await fetch("/api/admin/editions/2027/go-live", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
