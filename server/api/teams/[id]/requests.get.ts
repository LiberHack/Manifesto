import { requireRegistration } from "#server/utils/requireRegistration";
import { requireTeamLeadership } from "#server/utils/registrationContext";

export default defineEventHandler(async (event) => {
  const ctx = await requireRegistration(event);
  const { supabase, edition } = ctx;

  const teamId = getRouterParam(event, "id");
  await requireTeamLeadership(
    ctx,
    teamId!,
    "Only the team leader can view requests",
  );

  const { data, error } = await supabase
    .from("join_requests")
    .select(
      "id, status, created_at, participant:participants(id, name)",
    )
    .eq("team_id", teamId!)
    .eq("edition_slug", edition.slug)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[teams/requests.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  // Skills live on the requester's registration for this edition, not on the
  // identity mirror, so they are resolved in a second pass.
  const ids = (data ?? [])
    .map((r) => (r.participant as unknown as { id: string } | null)?.id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return data ?? [];

  const { data: regs } = await supabase
    .from("registrations")
    .select("participant_id, skills")
    .eq("edition_slug", edition.slug)
    .in("participant_id", ids);

  const skillsByParticipant = new Map(
    (regs ?? []).map((r) => [r.participant_id as string, r.skills as string[]]),
  );

  return (data ?? []).map((r) => {
    const participant = r.participant as unknown as {
      id: string;
      name: string;
    } | null;
    return {
      ...r,
      participant: participant
        ? {
            ...participant,
            skills: skillsByParticipant.get(participant.id) ?? [],
          }
        : null,
    };
  });
});
