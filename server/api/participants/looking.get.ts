import { requireRegistration } from "#server/utils/requireRegistration";
import { PUBLIC_PROFILE_COLUMNS, toPublicProfile } from "#server/utils/joinRequests";

/**
 * Participants who asked to be found by teams, for a leader choosing whom to
 * invite. Only people with matching_status = 'looking' and no team appear;
 * the archive `public` flag plays no part in this.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  if (registration.role !== "leader" || !registration.team_id) {
    throw createError({
      statusCode: 403,
      message: "Only team leaders can browse participants looking for a team",
    });
  }

  const [{ data, error }, { data: open }] = await Promise.all([
    supabase
      .from("registrations")
      .select(`participant_id, ${PUBLIC_PROFILE_COLUMNS}`)
      .eq("edition_slug", edition.slug)
      .eq("matching_status", "looking")
      .is("team_id", null)
      .neq("id", registration.id)
      .order("registered_at", { ascending: true }),
    supabase
      .from("join_requests")
      .select("participant_id, kind")
      .eq("team_id", registration.team_id)
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  if (error) {
    console.error("[participants/looking] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  // Surface an existing open request so the page offers no duplicate invite.
  const openByParticipant = new Map(
    (open ?? []).map((r) => [r.participant_id as string, r.kind as string]),
  );

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    ...toPublicProfile(row),
    open_request: openByParticipant.get(row.participant_id as string) ?? null,
  }));
});
