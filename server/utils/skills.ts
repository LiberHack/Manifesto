import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSkills } from "#server/utils/skillNormalize";
import { MAX_NEW_SKILLS, MAX_SKILL_LENGTH, MAX_SKILLS } from "#shared/skills";

export interface ResolvedSkills {
  /** Normalised, stored in registrations.skills. */
  skills: string[];
  /** As typed (trimmed), stored in registrations.skills_input. */
  skills_input: string[];
  /** Normalised skills missing from the catalogue, to add on save. */
  new_skills: string[];
}

/**
 * Validate a participant's skill list and normalise it against the catalogue.
 *
 * @throws 400 on a malformed list, 422 when it would take the skills the
 *   caller has added to the catalogue over MAX_NEW_SKILLS.
 */
export async function resolveSkills(
  supabase: SupabaseClient,
  value: unknown,
  createdBy: string,
): Promise<ResolvedSkills> {
  if (value !== undefined && !Array.isArray(value)) {
    throw createError({ statusCode: 400, message: "skills must be an array" });
  }
  const input = ((value as unknown[]) ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  if (input.length > MAX_SKILLS) {
    throw createError({ statusCode: 400, message: `Maximum ${MAX_SKILLS} skills allowed` });
  }
  const tooLong = input.find((s) => s.length > MAX_SKILL_LENGTH);
  if (tooLong) {
    throw createError({
      statusCode: 400,
      message: `Skill "${tooLong}" exceeds ${MAX_SKILL_LENGTH} characters`,
    });
  }

  const { data: known } = await supabase.from("skills").select("name");
  const catalogue = (known ?? []).map((s: { name: string }) => s.name);
  const skills = normalizeSkills(input, catalogue);

  const knownKeys = new Set(catalogue.map((name) => name.toLowerCase()));
  const newSkills = skills.filter((s) => !knownKeys.has(s.toLowerCase()));
  if (newSkills.length > 0) {
    const { count } = await supabase
      .from("skills")
      .select("id", { count: "exact", head: true })
      .eq("created_by", createdBy);
    if ((count ?? 0) + newSkills.length > MAX_NEW_SKILLS) {
      throw createError({
        statusCode: 422,
        message: `You can only add up to ${MAX_NEW_SKILLS} new skills`,
      });
    }
  }

  return { skills, skills_input: input, new_skills: newSkills };
}

/** Add skills to the catalogue on the caller's behalf. */
export async function addSkillsToCatalogue(
  supabase: SupabaseClient,
  names: string[],
  createdBy: string,
): Promise<void> {
  if (names.length === 0) return;
  await supabase
    .from("skills")
    .insert(names.map((name) => ({ name, created_by: createdBy })));
}
