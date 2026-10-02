import { requireRegistration } from "#server/utils/requireRegistration";
import { PUBLIC_PROFILE_COLUMNS, toPublicProfile } from "#server/utils/joinRequests";

/**
 * Open team proposals from the organizers that include the caller, with the
 * other proposed members' public profiles and everyone's answer so far.
 */
export default defineEventHandler(async (event) => {
  const { registration, supabase } = await requireRegistration(event);

  const { data: mine } = await supabase
    .from("team_proposal_members")
    .select("proposal_id, response")
    .eq("registration_id", registration.id);

  const ids = (mine ?? []).map((m) => m.proposal_id as string);
  if (ids.length === 0) return [];

  const { data: proposals } = await supabase
    .from("team_proposals")
    .select(
      "id, name, note, status, created_at, " +
        `members:team_proposal_members(position, response, registration:registrations(${PUBLIC_PROFILE_COLUMNS}))`,
    )
    .in("id", ids)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return ((proposals ?? []) as unknown as Array<{
    id: string;
    name: string;
    note: string | null;
    status: string;
    created_at: string;
    members: Array<{ position: number; response: string; registration: Record<string, unknown> }>;
  }>).map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note,
    created_at: p.created_at,
    my_response: (mine ?? []).find((m) => m.proposal_id === p.id)?.response ?? "pending",
    members: [...p.members]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ response: m.response, profile: toPublicProfile(m.registration) })),
  }));
});
