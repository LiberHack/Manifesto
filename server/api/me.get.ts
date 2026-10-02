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
      "id, role, team_id, skills, skills_input, experience, public, public_opted_in_at, accepted_terms_at, registered_at, " +
        "matching_status, intro, preferred_roles, interests, goals, languages, organizer_help_requested_at, " +
        "github_url, gitlab_url, codeberg_url, portfolio_url, " +
        "catering:registration_catering(diet, note), " +
        "contact:registration_contacts(method), " +
        "team:teams!registrations_team_id_fkey(id, name, skills_wanted, description, leader_id, invite_code, github_url, " +
        "recruiting, wanted_roles, desired_size, interests, goals, welcomes_beginners, languages)",
    )
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration) {
    return { ...participant, edition, registration: null, team: null };
  }

  const { team, catering, contact, ...rest } = registration as unknown as Record<string, unknown> & {
    team: unknown;
    catering: unknown;
    contact: unknown;
  };
  const cateringRow = (Array.isArray(catering) ? catering[0] : catering) ?? null;

  return {
    ...participant,
    edition,
    // Catering lives in its own restricted table; only the owner sees it here.
    // Only whether a contact exists: the value itself is served by /api/me/contact.
    registration: { ...rest, catering: cateringRow, contact_complete: contact !== null },
    team: team ?? null,
    // Flattened per-edition fields, kept for template convenience.
    skills: rest.skills,
    experience: rest.experience,
  };
});
