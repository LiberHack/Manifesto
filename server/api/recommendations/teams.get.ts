import { requireRegistration } from "#server/utils/requireRegistration";
import {
  PERSON_SIGNAL_COLUMNS,
  TEAMS_SHOWN,
  blockedParticipants,
  exposureCounts,
  openTeams,
  personSignals,
  recordExposures,
  teamSignals,
} from "#server/utils/recommendations";
import { rankMatches, scoreMatch } from "#shared/recommendations";
import { teamVacancies } from "#shared/teamFormation";

/**
 * Up to three suggested teams for a participant without one, with the
 * evidence behind each. Recomputed on every request, so it follows membership
 * and preference changes; a suggestion never reserves a place.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  if (registration.team_id) return { suggestions: [] };

  const [{ data: me }, teams, { data: requests }, { data: dismissed }, blocked, exposures] =
    await Promise.all([
      supabase
        .from("registrations")
        .select(PERSON_SIGNAL_COLUMNS)
        .eq("id", registration.id)
        .single(),
      openTeams(supabase, edition.slug),
      // Any past or open request with a team keeps it out: pending ones are in
      // progress, closed ones (declined, rejected, withdrawn) should not resurface.
      supabase
        .from("join_requests")
        .select("team_id")
        .eq("participant_id", registration.participant_id)
        .eq("edition_slug", edition.slug),
      supabase
        .from("recommendation_dismissals")
        .select("team_id")
        .eq("dismissed_by", registration.id)
        .is("candidate_id", null),
      blockedParticipants(supabase, registration.participant_id),
      exposureCounts(supabase, edition.slug, "team_id"),
    ]);

  const excluded = new Set([
    ...(requests ?? []).map((r) => r.team_id as string),
    ...(dismissed ?? []).map((d) => d.team_id as string),
  ]);
  const signals = personSignals((me ?? {}) as Record<string, unknown>);

  const eligible = teams.filter(
    (t) => !excluded.has(t.id) && !t.members.some((m) => blocked.has(m.participant_id)),
  );

  const ranked = rankMatches(
    eligible.map((team) => ({ item: team, match: scoreMatch(signals, teamSignals(team)) })),
    {
      id: (t) => t.id,
      exposures,
      viewerId: registration.id,
      day: new Date().toISOString().slice(0, 10),
      limit: TEAMS_SHOWN,
    },
  );

  await recordExposures(
    supabase,
    edition.slug,
    registration.id,
    ranked.map((r, i) => ({ team_id: r.item.id, candidate_id: null, score: r.match.score, rank: i + 1 })),
  );

  return {
    suggestions: ranked.map(({ item: t, match }) => ({
      team: {
        id: t.id,
        name: t.name,
        description: t.description,
        wanted_roles: t.wanted_roles,
        welcomes_beginners: t.welcomes_beginners,
        vacancies: teamVacancies(t.desired_size, t.members.length),
      },
      reasons: match.reasons,
      // Whether there was anything to compare; never shown as a percentage.
      evidence: match.score === null ? "none" : match.reasons.length > 0 ? "some" : "weak",
    })),
  };
});
