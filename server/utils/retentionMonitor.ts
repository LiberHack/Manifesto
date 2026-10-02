/** Hours after which a missing daily retention run is reported. */
export const RETENTION_MAX_AGE_HOURS = 26;

/**
 * Whether the daily retention job has been missed, and why.
 *
 * @returns an alert message, or null when the last run is recent enough.
 */
export function retentionAlert(
  lastRunAt: string | null,
  now: Date,
  maxAgeHours: number = RETENTION_MAX_AGE_HOURS,
): string | null {
  if (lastRunAt === null) {
    return "The retention job (public.run_retention) has never run. Check that pg_cron is enabled and the liberhack-retention job exists.";
  }
  const ageHours = (now.getTime() - Date.parse(lastRunAt)) / 3_600_000;
  if (Number.isNaN(ageHours) || ageHours > maxAgeHours) {
    return `The retention job last ran ${lastRunAt} (${Math.round(ageHours)} h ago). Individual analytics may be kept longer than the published 60 days until it runs again.`;
  }
  return null;
}
