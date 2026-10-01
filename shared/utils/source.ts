/**
 * Source tags, referrer categories and touch attribution.
 *
 * Shared by the client (reading the landing URL) and the server (validating
 * and attributing). The database checks in
 * supabase/migrations/20261001000200_source_links_and_analytics.sql mirror
 * these rules.
 */

/** A source-link tag as printed on a poster: `poster-fmi`, `insta-post-3`. */
export const SOURCE_TAG_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

export const SOURCE_CHANNELS = [
  "instagram",
  "poster",
  "print",
  "partner",
  "email",
  "other",
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

/** Referrer categories, matched on the parsed hostname only. */
const REFERRER_DOMAINS: Record<string, readonly string[]> = {
  "ref-instagram": ["instagram.com"],
  "ref-facebook": ["facebook.com", "fb.com", "fb.me", "messenger.com"],
  "ref-google": ["google.com", "google.bg"],
  "ref-telegram": ["t.me", "telegram.org", "telegram.me"],
  "ref-linkedin": ["linkedin.com", "lnkd.in"],
  "ref-tiktok": ["tiktok.com"],
  "ref-youtube": ["youtube.com", "youtu.be"],
  "ref-x": ["x.com", "twitter.com", "t.co"],
};

export const REF_CATEGORIES = [...Object.keys(REFERRER_DOMAINS), "ref-other"] as const;

/** Landed with no external referrer and no valid tag. */
export const DIRECT = "direct";
/** A registration from a consenting browser with no recorded landing. */
export const UNKNOWN = "unknown";

export const SYSTEM_SOURCES: readonly string[] = [DIRECT, UNKNOWN, ...REF_CATEGORIES];

/** Whether `tag` is a well-formed link tag that does not shadow a system source. */
export function isValidLinkTag(tag: unknown): tag is string {
  return (
    typeof tag === "string" &&
    SOURCE_TAG_PATTERN.test(tag) &&
    !tag.startsWith("ref-") &&
    tag !== DIRECT &&
    tag !== UNKNOWN &&
    tag !== "go"
  );
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Categorise a referrer hostname. Only the hostname is ever looked at or
 * stored — never the URL — and matching is exact or a true subdomain, so
 * `instagram.com.evil.io` and `notinstagram.com` are `ref-other`.
 *
 * @returns `direct` for no referrer, null for our own host (internal
 *   navigation is not a touch), otherwise a `ref-*` category.
 */
export function categorizeReferrerHost(host: unknown, ownHost: string): string | null {
  if (typeof host !== "string" || host === "") return DIRECT;
  const normalized = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]{1,253}$/.test(normalized)) return "ref-other";
  if (normalized === ownHost.toLowerCase()) return null;
  for (const [category, domains] of Object.entries(REFERRER_DOMAINS)) {
    if (domains.some((domain) => matchesDomain(normalized, domain))) return category;
  }
  return "ref-other";
}

/** First query value, for `?src=a&src=b`. */
export function firstQueryValue(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : undefined;
}

export const ATTRIBUTION_WINDOW_DAYS = 30;
export const MAX_TOUCHES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Touch {
  /** When the landing happened. */
  at: Date;
  /** A link tag, a `ref-*` category or `direct`. */
  source: string;
  /** Tie-breaker for touches in the same hour (event id). */
  order: number;
}

export interface Attribution {
  first: string;
  last: string;
  /** Distinct earlier sources other than `last`, once each. */
  assisted: string[];
}

/**
 * First / last / assisted for one registration.
 *
 * Expiry is applied first: only landings in the 30 days up to and including
 * `completedAt` count. `direct` landings are not touches, so a direct return
 * never overwrites the last attributable source. Of the touches left, the
 * earliest is always kept plus the latest nine.
 *
 * @returns `direct` when the browser only ever landed directly in the window,
 *   `unknown` when it has no landing in the window at all.
 */
export function computeAttribution(touches: readonly Touch[], completedAt: Date): Attribution {
  const windowStart = completedAt.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY_MS;
  const inWindow = touches
    .filter((t) => t.at.getTime() > windowStart && t.at.getTime() <= completedAt.getTime())
    .toSorted((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order);

  const qualifying = inWindow.filter((t) => t.source !== DIRECT);
  if (qualifying.length === 0) {
    const fallback = inWindow.length > 0 ? DIRECT : UNKNOWN;
    return { first: fallback, last: fallback, assisted: [] };
  }

  const retained =
    qualifying.length <= MAX_TOUCHES
      ? qualifying
      : [qualifying[0]!, ...qualifying.slice(-(MAX_TOUCHES - 1))];

  const first = retained[0]!.source;
  const last = retained.at(-1)!.source;
  const assisted = [...new Set(retained.slice(0, -1).map((t) => t.source))].filter(
    (source) => source !== last,
  );
  return { first, last, assisted };
}

/** `YYYY-MM-DD` in Europe/Sofia, the reporting timezone. */
export function sofiaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
