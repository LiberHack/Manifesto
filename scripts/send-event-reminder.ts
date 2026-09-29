/**
 * Queue an edition's arrival reminders as notification jobs. Delivery is done
 * by the dispatcher (the attendance desk's "Run operations now", or
 * POST /api/admin/notifications/dispatch), which re-checks each person's seat
 * at send time. Never run without --edition.
 *
 * --dry-run counts eligible registrations without queueing anything.
 * Re-running is harmless: jobs use a stable dedup key.
 *
 * Output is counts only — no names or addresses.
 */
import { createClient } from "@supabase/supabase-js";

const editionArgIndex = process.argv.indexOf("--edition");
const edition = editionArgIndex < 0 ? undefined : process.argv[editionArgIndex + 1];
const dryRun = process.argv.includes("--dry-run");
if (!edition || edition.startsWith("--")) throw new Error("Pass --edition <slug>");

const url = process.env.NUXT_PUBLIC_SUPABASE_URL;
const key = process.env.NUXT_SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase configuration");
const supabase = createClient(url, key);

// Every accepted seat in this edition, solo participants included: the
// registration is the unit, not the team.
const { data, error } = await supabase
  .from("registrations")
  .select("id")
  .eq("edition_slug", edition)
  .eq("seat_state", "accepted");
if (error) throw error;

const jobs = (data ?? []).map((r) => ({
  edition_slug: edition,
  registration_id: r.id as string,
  kind: "arrival",
  dedup_key: `arrival:${edition}:${r.id}`,
}));

if (dryRun) {
  console.log(`[DRY RUN] ${jobs.length} eligible registrations in ${edition}; nothing queued.`);
} else {
  const { error: queueError } = await supabase
    .from("notification_jobs")
    .upsert(jobs, { onConflict: "dedup_key", ignoreDuplicates: true });
  if (queueError) throw queueError;
  console.log(`Queued arrival reminders for ${jobs.length} registrations in ${edition} (existing jobs untouched).`);
}
