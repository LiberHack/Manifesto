import { requireRegistration } from "#server/utils/requireRegistration";
import { requireTeamLeadership } from "#server/utils/registrationContext";
import { PUBLIC_PROFILE_COLUMNS, toPublicProfile } from "#server/utils/joinRequests";

interface RequestRow {
  id: string;
  kind: "application" | "invitation";
  participant_id: string;
  message: string | null;
  created_at: string;
  expires_at: string | null;
}

/**
 * The leader's view of their team's open requests: applications with the
 * applicant's public profile and message, and invitations still awaiting an
 * answer. Never includes dietary or contact details.
 */
export default defineEventHandler(async (event) => {
  const ctx = await requireRegistration(event);
  const { supabase, edition } = ctx;

  const teamId = getRouterParam(event, "id")!;
  await requireTeamLeadership(ctx, teamId, "Only the team leader can view requests");

  const { data, error } = await supabase
    .from("join_requests")
    .select("id, kind, participant_id, message, created_at, expires_at")
    .eq("team_id", teamId)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[teams/requests.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const rows = (data ?? []) as RequestRow[];
  if (rows.length === 0) return [];

  // Profiles live on each person's registration for this edition.
  const { data: regs } = await supabase
    .from("registrations")
    .select(`participant_id, ${PUBLIC_PROFILE_COLUMNS}`)
    .eq("edition_slug", edition.slug)
    .in("participant_id", rows.map((r) => r.participant_id));

  const profiles = new Map(
    ((regs ?? []) as unknown as Array<Record<string, unknown>>).map((r) => [
      r.participant_id as string,
      toPublicProfile(r),
    ]),
  );

  return rows.map(({ participant_id, ...request }) => ({
    ...request,
    profile: profiles.get(participant_id) ?? null,
  }));
});
