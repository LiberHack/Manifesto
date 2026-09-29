import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

/** Team proposals of an edition with each member's answer. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);

  const { data, error } = await supabase
    .from("team_proposals")
    .select(
      "id, name, note, status, created_at, decided_at, team_id, " +
        "members:team_proposal_members(position, response, responded_at, registration:registrations(id, participant:participants(name)))",
    )
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/proposals.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return data ?? [];
});
