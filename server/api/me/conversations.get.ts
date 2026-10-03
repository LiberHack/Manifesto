import { requireRegistration } from "#server/utils/requireRegistration";
import { namesByRegistration } from "#server/utils/conversations";

interface Row {
  conversation_id: string;
  kind: "team" | "request";
  team_id: string;
  request_id: string | null;
  access: "read" | "write";
  unread: number;
  last_message_at: string | null;
}

/**
 * Conversations the caller can see right now, newest activity first, with
 * unread counts. Access is re-evaluated on every call, so leaving a team or
 * losing leadership removes entries immediately.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);

  const { data, error } = await supabase.rpc("list_conversations", {
    p_registration: registration.id,
  });
  if (error) {
    console.error("[me/conversations] list failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  const rows = (data ?? []) as Row[];

  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  const requestIds = rows.flatMap((r) => (r.request_id ? [r.request_id] : []));

  const [{ data: teams }, { data: requests }] = await Promise.all([
    teamIds.length
      ? supabase.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] }),
    requestIds.length
      ? supabase
          .from("join_requests")
          .select("id, kind, status, participant_id, edition_slug")
          .in("id", requestIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const requestById = new Map((requests ?? []).map((r) => [r.id as string, r]));

  // For a leader, a request conversation is titled after the other person.
  const { data: counterpartRegs } = requestIds.length
    ? await supabase
        .from("registrations")
        .select("id, participant_id")
        .eq("edition_slug", registration.edition_slug)
        .in("participant_id", [...new Set((requests ?? []).map((r) => r.participant_id as string))])
    : { data: [] };
  const regByParticipant = new Map(
    (counterpartRegs ?? []).map((r) => [r.participant_id as string, r.id as string]),
  );
  const names = await namesByRegistration(supabase, [...regByParticipant.values()]);

  return rows
    .map((r) => {
      const request = r.request_id ? requestById.get(r.request_id) : null;
      const mine = request?.participant_id === registration.participant_id;
      const counterpart = request
        ? names.get(regByParticipant.get(request.participant_id as string) ?? "")?.name
        : null;
      return {
        id: r.conversation_id,
        kind: r.kind,
        access: r.access,
        unread: Number(r.unread),
        last_message_at: r.last_message_at,
        team: { id: r.team_id, name: teamName.get(r.team_id) ?? "" },
        title:
          r.kind === "team"
            ? `${teamName.get(r.team_id) ?? "Team"} — team chat`
            : mine
              ? teamName.get(r.team_id) ?? "Team"
              : counterpart ?? "Applicant",
        request: request ? { kind: request.kind, status: request.status } : null,
      };
    })
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
});
