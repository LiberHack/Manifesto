import {
  assertEditionWritable,
  requireAdmin,
  resolveAdminEdition,
} from "#server/utils/adminAuth";
import { MAX_TEAM_SIZE } from "#shared/teamFormation";
import { sendProposalNotification } from "#server/utils/email";

/**
 * Propose a new team of 2–6 people who have no team. Nobody is placed until
 * every one of them accepts.
 */
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);

  const body = (await readBody<{ name?: unknown; note?: unknown; registration_ids?: unknown }>(event)) ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const ids = Array.isArray(body.registration_ids)
    ? [...new Set(body.registration_ids.filter((id): id is string => typeof id === "string"))]
    : [];

  if (!name || name.length > 32) {
    throw createError({ statusCode: 400, message: "Team name must be 1–32 characters" });
  }
  if (note.length > 500) throw createError({ statusCode: 400, message: "Note is too long" });
  if (ids.length < 2 || ids.length > MAX_TEAM_SIZE) {
    throw createError({ statusCode: 400, message: `Propose 2–${MAX_TEAM_SIZE} people` });
  }

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, team_id, participant:participants(email)")
    .eq("edition_slug", edition.slug)
    .in("id", ids);
  if ((regs ?? []).length !== ids.length || regs!.some((r) => r.team_id)) {
    throw createError({ statusCode: 409, message: "Everyone proposed must be registered and without a team" });
  }

  const { data: proposal, error } = await supabase
    .from("team_proposals")
    .insert({ edition_slug: edition.slug, name, note: note || null, created_by: user.sub })
    .select("id")
    .single();
  if (error) {
    console.error("[admin/proposals.post] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const { error: membersError } = await supabase
    .from("team_proposal_members")
    .insert(ids.map((id, i) => ({ proposal_id: proposal.id, registration_id: id, position: i + 1 })));
  if (membersError) {
    await supabase.from("team_proposals").delete().eq("id", proposal.id);
    console.error("[admin/proposals.post] members insert failed:", membersError.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  for (const r of regs ?? []) {
    const email = (r.participant as unknown as { email: string } | null)?.email;
    if (email) void sendProposalNotification(email, name).catch(() => {});
  }

  return proposal;
});
