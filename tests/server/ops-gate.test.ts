import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";
import { isOpsClosedExempt } from "~/utils/registrationGate";

describe("Ops-closed gate — exempt routes", () => {
  it("keeps the admin panel reachable so it can be reopened", () => {
    expect(isOpsClosedExempt("/ops/admin")).toBe(true);
    expect(isOpsClosedExempt("/ops/admin/print-teams")).toBe(true);
  });

  it("keeps the auth flows reachable", () => {
    for (const path of [
      "/ops/login",
      "/ops/confirm",
      "/ops/verify-email",
      "/ops/forgot-password",
      "/ops/reset-password",
    ]) {
      expect(isOpsClosedExempt(path)).toBe(true);
    }
  });

  it("closes the participant area", () => {
    for (const path of [
      "/ops/dashboard",
      "/ops/teams",
      "/ops/teams/abc",
      "/ops/team/create",
      "/ops/register-edition",
    ]) {
      expect(isOpsClosedExempt(path)).toBe(false);
    }
  });
});

describe("GET /api/editions/current", () => {
  it("is public and reports a closed area when no edition is readable", async () => {
    const res = await fetch("/api/editions/current");
    expect(res.status).toBe(200);

    // The fixture's database answers "no rows", which is also what a deploy
    // running ahead of its migrations sees: closed, not broken.
    expect(await res.json()).toEqual({
      edition: null,
      full: true,
      ops_open: false,
    });
  });
});
