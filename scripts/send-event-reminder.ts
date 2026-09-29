/**
 * Queue and deliver an edition's arrival reminder. Never run without --edition.
 * --dry-run lists recipients without creating jobs or sending email.
 * Re-running uses a stable dedup key; failed jobs are retried up to three times.
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const editionArgIndex = process.argv.indexOf("--edition");
const edition = editionArgIndex < 0 ? undefined : process.argv[editionArgIndex + 1];
const dryRun = process.argv.includes("--dry-run");
if (!edition || edition.startsWith("--")) throw new Error("Pass --edition <slug>");
const url = process.env.NUXT_PUBLIC_SUPABASE_URL;
const key = process.env.NUXT_SUPABASE_SECRET_KEY;
const resendKey = process.env.NUXT_RESEND_API_KEY;
const from = process.env.NUXT_RESEND_FROM_EMAIL;
if (!url || !key || (!dryRun && (!resendKey || !from))) throw new Error("Missing Supabase or Resend configuration");
const supabase = createClient(url, key);
const resend = resendKey ? new Resend(resendKey) : null;
const html = readFileSync(join(import.meta.dirname, "../server/emails/dist/event-reminder.html"), "utf8");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
if (!dryRun) {
  // A worker that crashed after claiming a job must not strand it forever.
  const { error: resetError } = await supabase.from("notification_jobs")
    .update({ status: "failed", last_error: "Previous send timed out" })
    .eq("edition_slug", edition).eq("kind", "arrival").eq("status", "sending")
    .lt("next_attempt_at", new Date().toISOString());
  if (resetError) throw resetError;
}

type Registration = { id: string; seat_state: string; participant: { name: string; email: string } | null };
const { data, error } = await supabase.from("registrations")
  .select("id, seat_state, participant:participants(name, email)")
  .eq("edition_slug", edition).in("seat_state", ["accepted", "offered"]);
if (error) throw error;
const registrations = (data ?? []) as unknown as Registration[];
for (const registration of registrations) {
  const recipient = registration.participant;
  if (!recipient?.email) continue;
  const dedupKey = `arrival:${edition}:${registration.id}`;
  if (dryRun) { console.log(`[DRY RUN] ${recipient.email} (${dedupKey})`); continue; }
  const { error: queueError } = await supabase.from("notification_jobs").upsert({
    edition_slug: edition, registration_id: registration.id, kind: "arrival", dedup_key: dedupKey,
  }, { onConflict: "dedup_key", ignoreDuplicates: true });
  if (queueError) throw queueError;
  const { data: job, error: jobError } = await supabase.from("notification_jobs")
    .select("id, status, attempts, next_attempt_at").eq("dedup_key", dedupKey).single();
  if (jobError) throw jobError;
  if (job.status === "sent" || job.status === "cancelled" || job.status === "sending" ||
      job.attempts >= 3 || Date.parse(job.next_attempt_at) > Date.now()) continue;
  const { data: claimed, error: claimError } = await supabase.from("notification_jobs")
    .update({ status: "sending", attempts: job.attempts + 1,
      next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString() })
    .eq("id", job.id).eq("status", job.status).eq("attempts", job.attempts)
    .select("id").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) continue;
  try {
    const result = await resend!.emails.send({
      from: from!, to: [recipient.email], subject: "LiberHack — arrival reminder",
      html: html.replaceAll("{{LEADER_NAME}}", escapeHtml(recipient.name)),
      text: `Хей, ${recipient.name}! Очакваме те на LiberHack. Виж програмата на https://liberhack.org/programme и донеси лаптоп и зарядно.`,
    });
    if (result.error) throw result.error;
    await supabase.from("notification_jobs").update({ status: "sent", delivered_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    console.log(`Sent ${recipient.email}`);
  } catch (sendError) {
    const detail = sendError instanceof Error ? sendError.message : String(sendError);
    await supabase.from("notification_jobs").update({ status: "failed", last_error: detail.slice(0, 500),
      next_attempt_at: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString() }).eq("id", job.id);
    console.error(`Failed ${recipient.email}: ${detail}`);
  }
}
console.log(`${registrations.length} eligible registrations in ${edition}`);
