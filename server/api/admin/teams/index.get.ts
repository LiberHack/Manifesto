import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

interface MemberRow {
  id: string;
  participant: { id: string; name: string; email: string } | null;
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, name, leader_id, skills_wanted, description, created_at, " +
        "members:registrations!registrations_team_id_fkey(id, participant:participants(id, name, email))",
    )
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/teams] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  // `leader_id` is a registration id, so members are keyed by registration id
  // to keep the leader comparison a single equality on the client.
  return (data ?? []).map((team) => ({
    ...team,
    members: ((team.members ?? []) as unknown as MemberRow[]).map((m) => ({
      id: m.id,
      participant_id: m.participant?.id ?? null,
      name: m.participant?.name ?? "",
      email: m.participant?.email ?? "",
    })),
  }));
});
