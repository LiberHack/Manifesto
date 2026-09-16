import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Edition {
  slug: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: "draft" | "live" | "archived";
  participant_cap: number;
}

export interface Registration {
  id: string;
  participant_id: string;
  edition_slug: string;
  role: "participant" | "leader";
  team_id: string | null;
  skills: string[];
  dietary: string | null;
  experience: "beginner" | "intermediate" | "experienced" | null;
  public: boolean;
}

export interface AuthedUser {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface RegistrationContext {
  user: AuthedUser;
  registration: Registration;
  edition: Edition;
  supabase: SupabaseClient;
}

/**
 * The edition currently open for participation, or null when none is live.
 */
export async function getCurrentEdition(
  supabase: SupabaseClient,
): Promise<Edition | null> {
  const { data } = await supabase
    .from("editions")
    .select("slug, name, starts_at, ends_at, status, participant_cap")
    .eq("is_current", true)
    .maybeSingle();

  return (data as Edition | null) ?? null;
}

/**
 * Resolve a user's registration in the current edition.
 *
 * Kept free of Nitro-only imports so it is unit-testable; `requireRegistration`
 * is the thin H3 wrapper that supplies the user and the client.
 *
 * @throws 401 when `user` is null, 503 when no edition is live,
 *   403 `not_registered` when the account has not opted into it.
 */
export async function resolveRegistrationContext(
  user: AuthedUser | null,
  supabase: SupabaseClient,
): Promise<RegistrationContext> {
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const edition = await getCurrentEdition(supabase);
  if (!edition) {
    throw createError({ statusCode: 503, message: "no_live_edition" });
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select(
      "id, participant_id, edition_slug, role, team_id, skills, dietary, experience, public",
    )
    .eq("participant_id", user.sub)
    .eq("edition_slug", edition.slug)
    .maybeSingle();

  if (!registration) {
    throw createError({ statusCode: 403, message: "not_registered" });
  }

  return {
    user,
    registration: registration as Registration,
    edition,
    supabase,
  };
}

/**
 * Resolve a team the caller leads in the current edition.
 *
 * @throws 404 when the team does not exist in the current edition,
 *   403 when the caller is not its leader.
 */
export async function requireTeamLeadership(
  ctx: RegistrationContext,
  teamId: string,
  forbiddenMessage: string,
): Promise<{ id: string; leader_id: string; name: string }> {
  const { data: team } = await ctx.supabase
    .from("teams")
    .select("id, leader_id, name")
    .eq("id", teamId)
    .eq("edition_slug", ctx.edition.slug)
    .maybeSingle();

  if (!team) throw createError({ statusCode: 404, message: "Team not found" });
  if (team.leader_id !== ctx.registration.id) {
    throw createError({ statusCode: 403, message: forbiddenMessage });
  }

  return team as { id: string; leader_id: string; name: string };
}
