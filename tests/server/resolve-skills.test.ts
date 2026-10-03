import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSkills } from "../../server/utils/skills";
import { MAX_NEW_SKILLS, MAX_SKILLS } from "../../shared/skills";

const USER = "00000000-0000-0000-0000-000000000001";

/** Minimal stand-in for the two skills queries resolveSkills makes. */
function fakeSupabase(catalogue: string[], createdByUser: number) {
  return {
    from: () => ({
      select: (_columns: string, options?: { head?: boolean }) =>
        options?.head
          ? { eq: async () => ({ count: createdByUser }) }
          : Promise.resolve({ data: catalogue.map((name) => ({ name })) }),
    }),
  } as unknown as SupabaseClient;
}

describe("resolveSkills", () => {
  it(`rejects more than ${MAX_SKILLS} skills`, async () => {
    const skills = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `S${i}`);
    await expect(
      resolveSkills(fakeSupabase(skills, 0), skills, USER),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("counts new skills the caller added on earlier saves", async () => {
    await expect(
      resolveSkills(fakeSupabase([], MAX_NEW_SKILLS - 1), ["Zig", "Odin"], USER),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("accepts new skills within the remaining allowance", async () => {
    const result = await resolveSkills(
      fakeSupabase(["Rust"], MAX_NEW_SKILLS - 1),
      ["Rust", "Zig"],
      USER,
    );
    expect(result.new_skills).toEqual(["Zig"]);
  });

  it("does not spend the allowance on catalogue skills", async () => {
    const result = await resolveSkills(
      fakeSupabase(["Rust", "Go"], MAX_NEW_SKILLS),
      ["Rust", "Go"],
      USER,
    );
    expect(result.new_skills).toEqual([]);
  });
});
