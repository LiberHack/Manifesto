import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";
const queues = ["unmatched", "unanswered_request", "uncertain", "contact_failure", "unconfirmed_team"];
const statuses = ["open", "assigned", "contacted", "resolved"];
export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const body = await readBody<{ queue?: string; subject_id?: string; status?: string; owner_id?: string | null; outcome?: string }>(event);
  if (!queues.includes(body?.queue ?? "") || !statuses.includes(body?.status ?? "") || !body.subject_id || (body.outcome?.length ?? 0) > 500)
    throw createError({ statusCode: 400, message: "Invalid outreach" });
  const { error } = await supabase.from("organizer_outreach").upsert({
    edition_slug: edition.slug, queue: body.queue, subject_id: body.subject_id,
    status: body.status, owner_id: body.owner_id ?? (body.status === "open" ? null : user.sub),
    outcome: body.outcome ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw createError({ statusCode: 500, message: "Could not save outreach" });
  return { ok: true };
});
