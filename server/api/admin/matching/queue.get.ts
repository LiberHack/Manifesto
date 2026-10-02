import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";
import { PUBLIC_PROFILE_COLUMNS, toPublicProfile } from "#server/utils/joinRequests";

/**
 * Participants without a team who are looking or asked the organizers for
 * help, oldest registration first, with how far their own attempts got.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("registrations")
    .select(`participant_id, registered_at, matching_status, organizer_help_requested_at, ${PUBLIC_PROFILE_COLUMNS}`)
    .eq("edition_slug", edition.slug)
    .is("team_id", null)
    .or("matching_status.eq.looking,organizer_help_requested_at.not.is.null")
    .order("registered_at", { ascending: true });

  if (error) {
    console.error("[admin/matching/queue] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const { data: requests } = rows.length
    ? await supabase
        .from("join_requests")
        .select("participant_id, status")
        .eq("edition_slug", edition.slug)
        .in("participant_id", rows.map((r) => r.participant_id as string))
    : { data: [] };

  const tally = new Map<string, { pending: number; closed: number }>();
  for (const r of requests ?? []) {
    const t = tally.get(r.participant_id as string) ?? { pending: 0, closed: 0 };
    if (r.status === "pending") t.pending++;
    else t.closed++;
    tally.set(r.participant_id as string, t);
  }

  return rows.map((r) => ({
    profile: toPublicProfile(r),
    registered_at: r.registered_at,
    matching_status: r.matching_status,
    help_requested_at: r.organizer_help_requested_at,
    requests: tally.get(r.participant_id as string) ?? { pending: 0, closed: 0 },
  }));
});
