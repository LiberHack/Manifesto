import { requireAdmin, resolveAdminEdition, assertEditionWritable } from "#server/utils/adminAuth";

/** Queue due milestone and unanswered-application jobs with stable dedup keys. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  assertEditionWritable(edition);
  const { data: settings, error: settingsError } = await supabase.from("editions")
    .select("starts_at, reminder_mixer_days, reminder_reconfirm_days, reminder_arrival_hours, unanswered_request_hours")
    .eq("slug", edition.slug).single();
  if (settingsError) throw createError({ statusCode: 500, message: "Timing unavailable" });
  const now = Date.now();
  const due: string[] = [];
  if (settings.starts_at) {
    const start = Date.parse(settings.starts_at);
    if (now >= start - settings.reminder_mixer_days * 86400_000 && now < start) due.push("mixer");
    if (now >= start - settings.reminder_reconfirm_days * 86400_000 && now < start) due.push("reconfirm");
    if (now >= start - settings.reminder_arrival_hours * 3600_000 && now < start) due.push("arrival");
  }
  const [{ data: registrations, error: registrationsError }, { data: requests }] = await Promise.all([
    supabase.from("registrations").select("id, seat_state, team_id").eq("edition_slug", edition.slug),
    supabase.from("join_requests").select("id, team_id, kind, status, created_at").eq("edition_slug", edition.slug).eq("status", "pending"),
  ]);
  if (registrationsError) throw createError({ statusCode: 500, message: "Registrations unavailable" });
  const jobs: { edition_slug: string; registration_id: string; kind: string; dedup_key: string }[] = [];
  for (const r of registrations ?? []) {
    if (r.seat_state !== "accepted" && r.seat_state !== "offered") continue;
    for (const kind of due) {
      if (kind === "mixer" && r.team_id) continue;
      if (kind === "reconfirm" && r.seat_state !== "accepted") continue;
      jobs.push({ edition_slug: edition.slug, registration_id: r.id, kind,
        dedup_key: `${kind}:${edition.slug}:${r.id}` });
    }
  }
  const overdue = (requests ?? []).filter((r) => r.kind === "application" &&
    Date.parse(r.created_at) + settings.unanswered_request_hours * 3600_000 <= now);
  if (overdue.length) {
    const teamIds = [...new Set(overdue.map((r) => r.team_id))];
    const { data: teams } = await supabase.from("teams").select("id, leader_id")
      .eq("edition_slug", edition.slug).in("id", teamIds);
    const leaders = new Map((teams ?? []).map((t) => [t.id, t.leader_id]));
    for (const req of overdue) {
      const leader = leaders.get(req.team_id);
      if (leader) jobs.push({ edition_slug: edition.slug, registration_id: leader,
        kind: "leader_unanswered", dedup_key: `leader_unanswered:${edition.slug}:${req.id}` });
    }
  }
  if (jobs.length) {
    const { error } = await supabase.from("notification_jobs").upsert(jobs,
      { onConflict: "dedup_key", ignoreDuplicates: true });
    if (error) throw createError({ statusCode: 500, message: "Could not queue reminders" });
  }
  return { due: due, candidates: jobs.length };
});
