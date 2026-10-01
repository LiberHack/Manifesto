import {
  ANALYTICS_CHOICE_COOKIE,
  parseAnalyticsChoice,
  type AnalyticsChoice,
  type ClientAnalyticsEvent,
} from "#shared/utils/privacy";

/** The visitor's analytics answer, read from the (non-identifying) choice cookie. */
export function readAnalyticsChoice(cookieHeader: string, now: number = Date.now()): AnalyticsChoice {
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ANALYTICS_CHOICE_COOKIE}=`));
  return parseAnalyticsChoice(
    match ? decodeURIComponent(match.slice(ANALYTICS_CHOICE_COOKIE.length + 1)) : undefined,
    now,
  );
}

export interface LandingContext {
  /** The `?src=` value as typed in the URL; the server validates it. */
  src?: string;
  /** Hostname of the referring page only — never the URL. */
  refHost?: string;
}

export type EventSender = (body: Record<string, unknown>) => Promise<unknown>;

/**
 * Send one event if, and only if, the visitor has granted analytics. Without
 * consent nothing is sent, stored or queued; failures are swallowed with a
 * warning so analytics can never break a page or a registration.
 *
 * @returns whether a request was attempted.
 */
export function trackIfGranted(
  choice: AnalyticsChoice,
  event: ClientAnalyticsEvent,
  send: EventSender,
  landing?: LandingContext,
): boolean {
  if (choice.state !== "granted") return false;
  const body: Record<string, unknown> = { event };
  if (event === "landing_viewed") {
    if (landing?.src) body.src = landing.src.slice(0, 48);
    if (landing?.refHost) body.ref_host = landing.refHost.slice(0, 253);
  }
  send(body).catch((e: unknown) => {
    console.warn("[analytics] event not recorded:", (e as Error).message);
  });
  return true;
}

/** Hostname of `document.referrer`, or undefined for none/unparsable. */
export function referrerHost(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname || undefined;
  } catch {
    return undefined;
  }
}
