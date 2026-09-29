import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamVacancies, type PublicProfile } from "#shared/teamFormation";

/**
 * Registration columns that make up a public profile, with the display name
 * from the identity mirror. Never add dietary or contact columns here: this
 * is what leaders and discovery see.
 */
export const PUBLIC_PROFILE_COLUMNS =
  "id, skills, experience, intro, preferred_roles, interests, goals, languages, " +
  "github_url, gitlab_url, codeberg_url, portfolio_url, participant:participants(name)";

export function toPublicProfile(row: Record<string, unknown>): PublicProfile {
  const participant = row.participant as { name: string } | null;
  return {
    registration_id: row.id as string,
    name: participant?.name ?? "",
    intro: (row.intro as string | null) ?? null,
    skills: (row.skills as string[]) ?? [],
    experience: (row.experience as PublicProfile["experience"]) ?? null,
    preferred_roles: (row.preferred_roles as PublicProfile["preferred_roles"]) ?? [],
    interests: (row.interests as string[]) ?? [],
    goals: (row.goals as PublicProfile["goals"]) ?? [],
    languages: (row.languages as string[]) ?? [],
    github_url: (row.github_url as string | null) ?? null,
    gitlab_url: (row.gitlab_url as string | null) ?? null,
    codeberg_url: (row.codeberg_url as string | null) ?? null,
    portfolio_url: (row.portfolio_url as string | null) ?? null,
  };
}

export interface SeatState {
  recruiting: boolean;
  vacancies: number;
}

/** Whether a team is recruiting and how many places it still wants to fill. */
export async function getSeatState(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SeatState> {
  const [{ data: team }, { count }] = await Promise.all([
    supabase.from("teams").select("recruiting, desired_size").eq("id", teamId).single(),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId),
  ]);
  return {
    recruiting: team?.recruiting ?? false,
    vacancies: teamVacancies(team?.desired_size ?? 0, count ?? 0),
  };
}

const DECISION_ERRORS: Record<string, [number, string]> = {
  request_not_found: [404, "Request not found"],
  request_not_pending: [409, "Request is no longer open"],
  not_team_leader: [403, "Only the team leader can respond to applications"],
  not_invitee: [403, "Only the invited person can respond to an invitation"],
  not_sender: [403, "Only the sender can withdraw this"],
  wrong_kind: [400, "That action does not apply to this request"],
  unknown_action: [400, "Unknown action"],
  already_in_team: [409, "Already in a team"],
  team_full: [409, "Team is full"],
  team_not_found: [404, "Team not found"],
  registration_not_found: [409, "The person is not registered for this edition"],
  edition_mismatch: [409, "The team belongs to another edition"],
};

/**
 * Turn an error raised by join_team / decide_join_request into an HTTP error.
 * Unknown errors are logged and become a 500.
 */
export function membershipError(error: { message: string }, context: string): never {
  const match = Object.entries(DECISION_ERRORS).find(([code]) =>
    error.message?.includes(code),
  );
  if (match) {
    const [, [statusCode, message]] = match;
    throw createError({ statusCode, message });
  }
  console.error(`[${context}] failed:`, error.message);
  throw createError({ statusCode: 500, message: "Internal server error" });
}
