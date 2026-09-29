import { requireAdmin, resolveAdminEdition } from "#server/utils/adminAuth";

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event);
  const edition = await resolveAdminEdition(event, supabase);
  const [{ data: registrations, error }, { data: requests }, { data: outreach }, { data: snapshots }, { data: jobs }] = await Promise.all([
    supabase.from("registrations").select("id, team_id, matching_status, intention, intention_at, seat_state, checked_in_at, registered_at, barrier:attendance_barriers(reasons, details), participant:participants(name, email)").eq("edition_slug", edition.slug),
    supabase.from("join_requests").select("id, team_id, created_at, status, decided_at, kind").eq("edition_slug", edition.slug),
    supabase.from("organizer_outreach").select("queue, subject_id, status, owner_id, outcome").eq("edition_slug", edition.slug),
    supabase.from("attendance_snapshots").select("cutoff, registration_id, team_id, formation_source").eq("edition_slug", edition.slug),
    supabase.from("notification_jobs").select("registration_id, status").eq("edition_slug", edition.slug).eq("status", "failed"),
  ]);
  if (error) throw createError({ statusCode: 500, message: "Attendance unavailable" });
  const rows = (registrations ?? []) as any[];
  const reqs = (requests ?? []) as any[];
  const out = (outreach ?? []) as any[];
  const teams = new Map<string, any[]>();
  for (const r of rows) if (r.team_id) teams.set(r.team_id, [...(teams.get(r.team_id) ?? []), r]);
  const queue = [] as { queue: string; subject_id: string; name: string; email?: string; status: string; owner_id: string | null; outcome: string | null }[];
  const add = (kind: string, id: string, name: string, email?: string) => {
    const saved = out.find((o) => o.queue === kind && o.subject_id === id);
    queue.push({ queue: kind, subject_id: id, name, email, status: saved?.status ?? "open", owner_id: saved?.owner_id ?? null, outcome: saved?.outcome ?? null });
  };
  for (const r of rows) {
    const name = r.participant?.name ?? "Participant";
    if (!r.team_id && r.seat_state !== "cancelled") add("unmatched", r.id, name, r.participant?.email);
    if (r.seat_state === "accepted" && (!r.intention || r.intention === "unsure")) add("uncertain", r.id, name, r.participant?.email);
    if ((jobs ?? []).some((j: any) => j.registration_id === r.id)) add("contact_failure", r.id, name, r.participant?.email);
  }
  const threshold = Date.now() - edition.unanswered_request_hours * 3600_000;
  for (const r of reqs) if (r.status === "pending" && Date.parse(r.created_at) < threshold) add("unanswered_request", r.id, "Unanswered request");
  for (const [id, members] of teams) if (members.every((m) => m.intention !== "coming")) add("unconfirmed_team", id, `Team ${id.slice(0, 8)}`);
  const valid = rows.filter((r) => r.seat_state === "accepted" || r.seat_state === "offered");
  const checkedIn = rows.filter((r) => r.checked_in_at).length;
  const responseHours = reqs.filter((r) => r.decided_at)
    .map((r) => (Date.parse(r.decided_at) - Date.parse(r.created_at)) / 3600_000);
  const cohort = Object.entries(Object.groupBy((snapshots ?? []).filter((s: any) => s.cutoff === "7_days"), (s: any) => !s.team_id ? "solo" : s.formation_source === "organizer" ? "organizer" : s.formation_source ? "platform" : "pre_existing"))
    .map(([source, members]) => ({ source, registrations: members?.length ?? 0, checked_in: members?.filter((s: any) => rows.find((r) => r.id === s.registration_id)?.checked_in_at).length ?? 0 }));
  return { edition: edition.slug, queue, roster: rows.map((r) => ({ id: r.id, name: r.participant?.name ?? "Participant", email: r.participant?.email ?? "", seat_state: r.seat_state, intention: r.intention, checked_in_at: r.checked_in_at, barrier: r.barrier })), metrics: {
    registered: rows.length, valid_registrations: valid.length,
    cancelled: rows.filter((r) => r.seat_state === "cancelled").length,
    waitlisted: rows.filter((r) => r.seat_state === "waitlisted").length,
    matching_opted_in: rows.filter((r) => r.matching_status === "looking").length,
    contacted: out.filter((o) => o.status === "contacted" || o.status === "resolved").length,
    joined: rows.filter((r) => r.team_id).length,
    reconfirmed: rows.filter((r) => r.intention === "coming").length,
    checked_in: checkedIn, attendance_rate: valid.length ? checkedIn / valid.length : null,
    whole_team_cancellations: [...teams.values()].filter((members) => members.every((m) => m.seat_state === "cancelled")).length,
    unanswered_requests: reqs.filter((r) => r.status === "pending").length,
    mean_response_hours: responseHours.length ? responseHours.reduce((a: number, b: number) => a + b, 0) / responseHours.length : null,
    solo_to_team: rows.filter((r) => r.team_id && (snapshots ?? []).some((s: any) => s.cutoff === "14_days" && s.registration_id === r.id && !s.team_id)).length,
    cohort,
  } };
});
