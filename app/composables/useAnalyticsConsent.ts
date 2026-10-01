import {
  ANALYTICS_CHOICE_COOKIE,
  parseAnalyticsChoice,
  type AnalyticsChoice,
  type ClientAnalyticsEvent,
} from "#shared/utils/privacy";
import {
  landingToRecordOnConsent,
  trackIfGranted,
  type LandingContext,
} from "~/utils/analyticsClient";

/**
 * Browser-level analytics consent, separate from any account. Shared state:
 * the choice, whether the settings dialog is open, and the landing context of
 * this page load (kept in memory only, never stored).
 */
export function useAnalyticsConsent() {
  // Read on the server too, so the rendered banner matches after hydration.
  const cookie = useCookie(ANALYTICS_CHOICE_COOKIE, { readonly: true, decode: (v) => v });
  const choice = useState<AnalyticsChoice>("analytics-choice", () =>
    parseAnalyticsChoice(cookie.value),
  );
  // Captured in setup: trackLanding also runs after an await.
  const route = useRoute();
  const settingsOpen = useState("analytics-settings-open", () => false);
  const landing = useState<LandingContext | null>("analytics-landing", () => null);
  const landingSent = useState("analytics-landing-sent", () => false);

  const send = (body: Record<string, unknown>) =>
    $fetch("/api/analytics/event", { method: "POST", body });

  function track(event: ClientAnalyticsEvent): void {
    trackIfGranted(choice.value, event, send);
  }

  /**
   * The landing of this page load, once, and only after consent exists — and
   * only while the visitor is still on the landing page.
   */
  function trackLanding(): void {
    if (landingSent.value) return;
    const current = landingToRecordOnConsent(landing.value, route.path);
    if (!current) return;
    if (trackIfGranted(choice.value, "landing_viewed", send, current)) {
      landingSent.value = true;
    }
  }

  async function decide(decision: "granted" | "denied"): Promise<void> {
    const res = await $fetch<{ state: "granted" | "denied"; expires_at?: string }>(
      "/api/analytics/consent",
      { method: "POST", body: { decision } },
    );
    choice.value =
      res.state === "granted"
        ? { state: "granted", expiresAt: Date.parse(res.expires_at!) }
        : { state: "denied" };
    settingsOpen.value = false;
    // Records the landing page only if the visitor is still on it, stamped
    // with the consent time by the server (see landingToRecordOnConsent).
    if (res.state === "granted") trackLanding();
  }

  async function withdraw(): Promise<void> {
    await $fetch("/api/analytics/consent", { method: "DELETE" });
    choice.value = { state: "denied" };
    settingsOpen.value = false;
  }

  return { choice, settingsOpen, landing, track, trackLanding, decide, withdraw };
}
