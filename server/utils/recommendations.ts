import type { SupabaseClient } from "@supabase/supabase-js";
import { teamVacancies } from "#shared/teamFormation";
import type { PersonSignals, TeamSignals } from "#shared/recommendations";

/** Suggestions a person sees, and candidates a leader sees. */
export const TEAMS_SHOWN = 3;
export const CANDIDATES_SHOWN = 5;

/** How far back exposures count towards rotation and attribution. */
export const EXPOSURE_WINDOW_DAYS = 14;

export const PERSON_SIGNAL_COLUMNS =
  "skills, preferred_roles, interests, goals, experience, languages";

export const TEAM_SIGNAL_COLUMNS =
  "skills_wanted, wanted_roles, interests, goals, welcomes_beginners, languages";

export function personSignals(row: Record<string, unknown>): PersonSignals {
  return {
    skills: (row.skills as string[]) ?? [],
    preferred_roles: (row.preferred_roles as PersonSignals["preferred_roles"]) ?? [],
    interests: (row.interests as string[]) ?? [],
    goals: (row.goals as PersonSignals["goals"]) ?? [],
    experience: (row.experience as PersonSignals["experience"]) ?? null,
    languages: (row.languages as string[]) ?? [],
  };
}

export function teamSignals(row: Record<string, unknown>): TeamSignals {
  return {
    skills_wanted: (row.skills_wanted as string[]) ?? [],
    wanted_roles: (row.wanted_roles as TeamSignals["wanted_roles"]) ?? [],
    interests: (row.interests as string[]) ?? [],
    goals: (row.goals as TeamSignals["goals"]) ?? [],
    welcomes_beginners: Boolean(row.welcomes_beginners),
    languages: (row.languages as string[]) ?? [],
  };
}

function windowStart(): string {
  return new Date(Date.now() - EXPOSURE_WINDOW_DAYS * 86_400_000).toISOString();
}

/**
 * Participant ids blocked by, or blocking, `participantId`. Blocks are
 * identity-level and apply in both directions.
 */
export async function blockedParticipants(
  supabase: SupabaseClient,
  participantId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("participant_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${participantId},blocked_id.eq.${participantId}`);
  return new Set(
    (data ?? []).map((b) => (b.blocker_id === participantId ? b.blocked_id : b.blocker_id)),
  );
}

/** Whether two participants have a block between them, either way. */
export async function isBlocked(
  supabase: SupabaseClient,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("is_blocked", { p_a: a, p_b: b });
  return data === true;
}

/** Exposure counts per id over the window, for rotating near-equal matches. */
export async function exposureCounts(
  supabase: SupabaseClient,
  edition: string,
  column: "team_id" | "candidate_id",
): Promise<Map<string, number>> {
  let query = supabase
    .from("recommendation_exposures")
    .select(column)
    .eq("edition_slug", edition)
    .gte("shown_at", windowStart());
  query = column === "team_id" ? query.is("candidate_id", null) : query.not("candidate_id", "is", null);
  const { data } = await query;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<Record<string, string>>) {
    const id = row[column]!;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export interface ExposureRow {
  team_id: string;
  candidate_id: string | null;
  score: number | null;
  rank: number;
}

/** Log what was shown. Never includes message text or private fields. */
export async function recordExposures(
  supabase: SupabaseClient,
  edition: string,
  viewerId: string,
  rows: ExposureRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("recommendation_exposures")
    .insert(rows.map((r) => ({ ...r, edition_slug: edition, viewer_id: viewerId })));
  if (error) console.error("[recommendations] exposure log failed:", error.message);
}

/**
 * Whether `viewerId` was recently shown this pairing, so a request made from
 * it can be attributed to recommendations. The client's claim alone is not
 * enough.
 */
export async function wasRecommended(
  supabase: SupabaseClient,
  viewerId: string,
  teamId: string,
  candidateId: string | null,
): Promise<boolean> {
  let query = supabase
    .from("recommendation_exposures")
    .select("id", { count: "exact", head: true })
    .eq("viewer_id", viewerId)
    .eq("team_id", teamId)
    .gte("shown_at", windowStart());
  query = candidateId ? query.eq("candidate_id", candidateId) : query.is("candidate_id", null);
  const { count } = await query;
  return (count ?? 0) > 0;
}

export interface TeamRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string | null;
  desired_size: number;
  recruiting: boolean;
  members: Array<{ id: string; participant_id: string }>;
}

/** Teams of an edition that are recruiting with at least one open place. */
export async function openTeams(supabase: SupabaseClient, edition: string): Promise<TeamRow[]> {
  const { data } = await supabase
    .from("teams")
    .select(
      `id, name, description, desired_size, recruiting, ${TEAM_SIGNAL_COLUMNS}, ` +
        "members:registrations!registrations_team_id_fkey(id, participant_id)",
    )
    .eq("edition_slug", edition)
    .eq("recruiting", true);

  return ((data ?? []) as unknown as TeamRow[]).filter(
    (t) => teamVacancies(t.desired_size, t.members.length) > 0,
  );
}
