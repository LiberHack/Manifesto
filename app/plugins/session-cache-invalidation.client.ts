import { expiredSessionCacheKeys, invalidateSessionCaches } from "~/composables/useSessionCache";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isApiWrite(request: unknown, options: { method?: string } | undefined): boolean {
  const method = (options?.method ?? "GET").toUpperCase();
  if (READ_METHODS.has(method)) return false;
  const url = typeof request === "string" ? request : request instanceof Request ? request.url : String(request);
  return new URL(url, window.location.origin).pathname.startsWith("/api/");
}

/**
 * Navigation reuses /api/me and the current edition (useSessionCache), so any
 * write that may change them has to invalidate them. Doing it here, for every
 * successful client-side write to /api/*, covers all present and future
 * mutation sites (team create, invite accept, go-live, …) instead of relying on
 * each one to call refresh(). The next page mount then refetches once.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const original = globalThis.$fetch;
  const wrapped = (async (request: Parameters<typeof original>[0], options?: Parameters<typeof original>[1]) => {
    const response = await original(request, options);
    if (isApiWrite(request, options)) invalidateSessionCaches(nuxtApp);
    return response;
  }) as typeof original;
  // Keep $fetch.raw / .native / .create working: copy the instance's own members.
  globalThis.$fetch = Object.assign(wrapped, original);

  // Components that stay mounted (the layout's edition state, AppBanners) are
  // not re-run on navigation, so nothing would revalidate them. After each
  // navigation, refresh whatever has expired, in the background.
  useRouter().afterEach(() => {
    const keys = expiredSessionCacheKeys(nuxtApp);
    if (keys.length) void refreshNuxtData(keys);
  });
});
