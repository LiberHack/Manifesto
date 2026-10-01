import { useSupabaseAdmin } from "#server/utils/supabase";
import { sendEmail } from "#server/utils/email";
import { retentionAlert } from "#server/utils/retentionMonitor";

/**
 * Daily check, run by the Worker's cron trigger (nuxt.config scheduledTasks +
 * wrangler.jsonc triggers): if pg_cron has not logged a retention run in the
 * last 26 hours, email the alert address (or every admin) and log an error.
 *
 * Staging and production share one Supabase project, so only production sends.
 */
export default defineTask({
  meta: {
    name: "privacy:retention-monitor",
    description: "Alert when the scheduled retention job has not run",
  },
  async run() {
    const config = useRuntimeConfig();
    const supabase = useSupabaseAdmin();

    const { data, error } = await supabase
      .from("maintenance_runs")
      .select("ran_at")
      .eq("job", "retention")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const alert = error
      ? `The retention monitor could not read maintenance_runs: ${error.message}`
      : retentionAlert((data as { ran_at: string } | null)?.ran_at ?? null, new Date());
    if (!alert) return { result: "ok" };

    console.error("[retention-monitor]", alert);
    if (config.public.appEnv !== "production") return { result: "stale (not production, no email)" };

    let recipients = [config.opsAlertEmail as string].filter(Boolean);
    if (recipients.length === 0) {
      const { data: admins } = await supabase.from("participants").select("email").eq("role", "admin");
      recipients = ((admins ?? []) as { email: string }[]).map((a) => a.email);
    }
    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: "[LiberHack] Retention job missed",
          text: `${alert}\n\nSee docs/privacy/retention-and-deletion.md → Monitoring.`,
          html: `<p>${alert}</p><p>See docs/privacy/retention-and-deletion.md → Monitoring.</p>`,
        }),
      ),
    );
    return { result: "alerted", recipients: recipients.length };
  },
});
