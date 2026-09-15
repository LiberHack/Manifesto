import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();

  const [{ data: participant, error }, edition] = await Promise.all([
    supabase
      .from("participants")
      .select("id, name, email, role, created_at")
      .eq("id", user.sub)
      .single(),
    getCurrentEdition(supabase),
  ]);

  if (error) throw createError({ statusCode: 500, message: error.message });

  // Spectator (no registration in the current edition) gets registration: null —
  // the single field the auth middleware checks.
  if (!edition) {
    return { ...participant, edition: null, registration: null, team: null };
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, role, team_id, skills, dietary, experience, public, accepted_terms_at, registered_at, " +
        "team:teams!registrations_team_id_fkey(id, name, skills_wanted, description, leader_id, invite_code, github_url)",
    )
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration) {
    return { ...participant, edition, registration: null, team: null };
  }

  const { team, ...rest } = registration as Record<string, unknown> & {
    team: unknown;
  };

  return {
    ...participant,
    edition,
    registration: rest,
    team: team ?? null,
    // Flattened per-edition fields, kept for template convenience.
    skills: rest.skills,
    dietary: rest.dietary,
    experience: rest.experience,
  };
});
