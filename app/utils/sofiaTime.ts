// Event times are entered and shown as Europe/Sofia wall-clock time,
// whatever timezone the admin's browser happens to be in.

const SOFIA_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Sofia",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Sofia wall-clock for an instant, as `YYYY-MM-DDTHH:mm`. */
function sofiaWallClock(ms: number): string {
  return SOFIA_FORMAT.format(ms).replace(" ", "T");
}

/** Read a `YYYY-MM-DDTHH:mm` wall-clock as if it were UTC. */
function wallClockAsUtc(local: string): number {
  return Date.parse(`${local}:00Z`);
}

/** Sofia's UTC offset, in ms, at the given instant. */
function sofiaOffset(ms: number): number {
  return wallClockAsUtc(sofiaWallClock(ms)) - ms;
}

/**
 * Format a UTC ISO timestamp for an `<input type="datetime-local">` showing
 * Sofia time.
 */
export function toSofiaLocal(iso: string | null): string {
  if (!iso) return "";
  return sofiaWallClock(new Date(iso).getTime());
}

/**
 * Convert a Sofia `datetime-local` value to a UTC ISO timestamp.
 *
 * The offset is taken at a first guess and then again at the corrected
 * instant, so times near a DST change resolve to the offset actually in force.
 */
export function fromSofiaLocal(local: string): string {
  if (!local) return "";
  const target = wallClockAsUtc(local);
  const guess = target - sofiaOffset(target);
  return new Date(target - sofiaOffset(guess)).toISOString();
}
