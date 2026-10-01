import { firstQueryValue } from "#shared/utils/source";
import { referrerHost } from "~/utils/analyticsClient";

const TRACKING_PARAMS = [
  "src",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

/**
 * Reads where this page load came from (tag + referrer hostname) into memory,
 * sends `landing_viewed` only if analytics is already granted, and removes
 * tracking parameters from the address bar so a copied link carries none.
 * Without consent nothing is stored or sent.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute();
  const router = useRouter();
  const { landing, trackLanding } = useAnalyticsConsent();

  landing.value = {
    path: route.path,
    src: firstQueryValue(route.query.src),
    refHost: referrerHost(document.referrer),
  };
  trackLanding();

  if (TRACKING_PARAMS.some((key) => key in route.query)) {
    const query = { ...route.query };
    for (const key of TRACKING_PARAMS) delete query[key];
    onNuxtReady(() => router.replace({ query, hash: route.hash }));
  }
});
