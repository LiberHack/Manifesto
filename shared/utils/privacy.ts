/**
 * Privacy constants shared by client and server.
 *
 * Bump PRIVACY_NOTICE_VERSION whenever content/legal/privacy*.md changes in a
 * way that affects what people agreed to: every consent record stores it.
 */
export const PRIVACY_NOTICE_VERSION = "2026-10-02";
/**
 * False while the launch facts in docs/privacy/README.md (controller identity,
 * recipients, processors, retention decisions) are unresolved. The admin panel
 * warns before opening registration while this is false.
 */
export const PRIVACY_NOTICE_FINAL = false;

/** Fixed life of an analytics id and its journey. Never extended. */
export const ANALYTICS_ID_DAYS = 30;
/** How long a "Reject analytics" answer is remembered before asking again. */
export const ANALYTICS_REJECTION_DAYS = 180;

/** HttpOnly random browser id; only exists after "Allow analytics". */
export const ANALYTICS_ID_COOKIE = "lh_aid";
/**
 * The visitor's answer, readable by the page so it knows whether to show the
 * banner: `granted.<expiry ms>` or `denied`. Holds no identifier.
 */
export const ANALYTICS_CHOICE_COOKIE = "lh_analytics";

/** Events the browser may send. Completion is recorded by the server only. */
export const CLIENT_ANALYTICS_EVENTS = [
  "landing_viewed",
  "registration_cta_clicked",
  "registration_started",
] as const;
export type ClientAnalyticsEvent = (typeof CLIENT_ANALYTICS_EVENTS)[number];

export type AnalyticsChoice =
  | { state: "granted"; expiresAt: number }
  | { state: "denied" }
  | { state: "unset" };

/**
 * Parse the choice cookie. An expired grant reads as `unset`, so the banner
 * asks again instead of silently continuing.
 */
export function parseAnalyticsChoice(raw: unknown, now: number = Date.now()): AnalyticsChoice {
  if (raw === "denied") return { state: "denied" };
  if (typeof raw === "string" && raw.startsWith("granted.")) {
    const expiresAt = Number(raw.slice("granted.".length));
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      return { state: "granted", expiresAt };
    }
  }
  return { state: "unset" };
}

export const DIETS = ["none", "vegetarian", "vegan", "other"] as const;
export type Diet = (typeof DIETS)[number];
export const MAX_DIETARY_NOTE_LENGTH = 200;
