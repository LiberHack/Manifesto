import { describe, it, expect } from "vitest";
import { resolveRegistrationContext } from "../../server/utils/registrationContext";

const LIVE_EDITION = {
  slug: "2027",
  name: "LiberHack 2027",
  starts_at: null,
  ends_at: null,
  status: "live" as const,
  participant_cap: 120,
  ops_enabled: true,
};

const CLOSED_EDITION = { ...LIVE_EDITION, ops_enabled: false };

const REGISTRATION = {
  id: "reg-1",
  participant_id: "user-1",
  edition_slug: "2027",
  role: "participant" as const,
  team_id: null,
  skills: ["Rust"],
  dietary: null,
  experience: "beginner" as const,
  public: true,
};

/**
 * Minimal stand-in for the chained supabase query builder: every call returns
 * `this` until the terminal `maybeSingle()`, which yields the queued result for
 * that table.
 */
function stubSupabase(results: Record<string, { data: unknown }>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "neq", "in"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => results[table] ?? { data: null };
      chain.single = async () => results[table] ?? { data: null };
      return chain;
    },
  };
}

const USER = { sub: "user-1" };

describe("resolveRegistrationContext", () => {
  it("throws 401 when there is no user", async () => {
    await expect(
      resolveRegistrationContext(null, stubSupabase({}) as never),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 503 when no edition is live", async () => {
    await expect(
      resolveRegistrationContext(
        USER,
        stubSupabase({ editions: { data: null } }) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 503, message: "no_live_edition" });
  });

  it("throws 403 ops_closed when the participant area is closed", async () => {
    await expect(
      resolveRegistrationContext(
        USER,
        stubSupabase({
          editions: { data: CLOSED_EDITION },
          registrations: { data: REGISTRATION },
        }) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: "ops_closed" });
  });

  it("throws 403 not_registered for a spectator", async () => {
    await expect(
      resolveRegistrationContext(
        USER,
        stubSupabase({
          editions: { data: LIVE_EDITION },
          registrations: { data: null },
        }) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403, message: "not_registered" });
  });

  it("returns the edition and registration for a registered user", async () => {
    const ctx = await resolveRegistrationContext(
      USER,
      stubSupabase({
        editions: { data: LIVE_EDITION },
        registrations: { data: REGISTRATION },
      }) as never,
    );

    expect(ctx.edition).toEqual(LIVE_EDITION);
    expect(ctx.registration).toEqual(REGISTRATION);
    expect(ctx.user.sub).toBe("user-1");
  });
});
