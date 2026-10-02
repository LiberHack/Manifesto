import { requireRegistration } from "#server/utils/requireRegistration";
import {
  CANDIDATES_SHOWN,
  TEAM_SIGNAL_COLUMNS,
  blockedParticipants,
  exposureCounts,
  personSignals,
  recordExposures,
  teamSignals,
} from "#server/utils/recommendations";
import { PUBLIC_PROFILE_COLUMNS, toPublicProfile } from "#server/utils/joinRequests";
import { rankMatches, scoreMatch } from "#shared/recommendations";
import { teamVacancies } from "#shared/teamFormation";

/**
 * Up to five people who asked to be found, suggested to a recruiting leader
 * with the evidence behind each. Only `matching_status = 'looking'` people
 * without a team are considered; blocks, dismissals and any earlier request
 * with this team keep a person out.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  if (registration.role !== "leader" || !registration.team_id) {
    throw createError({ statusCode: 403, message: "Only team leaders get candidate suggestions" });
  }
  const teamId = registration.team_id;

  const { data: team } = await supabase
    .from("teams")
    .select(
      `id, recruiting, desired_size, ${TEAM_SIGNAL_COLUMNS}, ` +
        "members:registrations!registrations_team_id_fkey(id, participant_id)",
    )
    .eq("id", teamId)
    .single();

  const row = team as unknown as {
    recruiting: boolean;
    desired_size: number;
    members: Array<{ participant_id: string }>;
  } & Record<string, unknown>;

  if (!row.recruiting || teamVacancies(row.desired_size, row.members.length) === 0) {
    return { suggestions: [], reason: row.recruiting ? "full" : "not_recruiting" };
  }

  const memberBlocks = await Promise.all(
    row.members.map((m) => blockedParticipants(supabase, m.participant_id)),
  );
  const blocked = new Set(memberBlocks.flatMap((set) => [...set]));

  const [{ data: people }, { data: requests }, { data: dismissed }, exposures] = await Promise.all([
    supabase
      .from("registrations")
      // The public profile already carries every matching signal.
      .select(`participant_id, ${PUBLIC_PROFILE_COLUMNS}`)
      .eq("edition_slug", edition.slug)
      .eq("matching_status", "looking")
      .is("team_id", null),
    supabase.from("join_requests").select("participant_id").eq("team_id", teamId),
    supabase
      .from("recommendation_dismissals")
      .select("candidate_id")
      .eq("team_id", teamId)
      .not("candidate_id", "is", null),
    exposureCounts(supabase, edition.slug, "candidate_id"),
  ]);

  const askedBefore = new Set((requests ?? []).map((r) => r.participant_id as string));
  const dismissedIds = new Set((dismissed ?? []).map((d) => d.candidate_id as string));
  const signals = teamSignals(row);

  const eligible = ((people ?? []) as unknown as Array<Record<string, unknown>>).filter(
    (p) =>
      !askedBefore.has(p.participant_id as string) &&
      !blocked.has(p.participant_id as string) &&
      !dismissedIds.has(p.id as string),
  );

  const ranked = rankMatches(
    eligible.map((p) => ({ item: p, match: scoreMatch(personSignals(p), signals) })),
    {
      id: (p) => p.id as string,
      exposures,
      viewerId: registration.id,
      day: new Date().toISOString().slice(0, 10),
      limit: CANDIDATES_SHOWN,
    },
  );

  await recordExposures(
    supabase,
    edition.slug,
    registration.id,
    ranked.map((r, i) => ({
      team_id: teamId,
      candidate_id: r.item.id as string,
      score: r.match.score,
      rank: i + 1,
    })),
  );

  return {
    suggestions: ranked.map(({ item, match }) => ({
      profile: toPublicProfile(item),
      reasons: match.reasons,
      evidence: match.score === null ? "none" : match.reasons.length > 0 ? "some" : "weak",
    })),
  };
});
