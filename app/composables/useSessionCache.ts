import type { NuxtApp } from "#app";
import { createSessionCache, type FetchCause, type SessionCache } from "~/utils/sessionCache";

// One set of caches per Nuxt app: per browser tab on the client, per request
// during SSR, so nothing is shared between visitors on the server.
const caches = new WeakMap<object, Map<string, { cache: SessionCache<unknown>; owner: () => string | null }>>();

/**
 * The navigation cache for `key`, plus a `getCachedData` for useAsyncData that
 * reuses it on page mounts and seeds it from the SSR payload on hydration.
 */
export function useSessionCache<T>(key: string, ttlMs: number, owner: () => string | null) {
  const nuxtApp = useNuxtApp();
  let byKey = caches.get(nuxtApp);
  if (!byKey) caches.set(nuxtApp, (byKey = new Map()));
  let slot = byKey.get(key);
  if (!slot) byKey.set(key, (slot = { cache: createSessionCache<unknown>(ttlMs), owner }));
  const store = slot.cache as SessionCache<T>;

  return {
    cache: store,
    /**
     * Stale-while-revalidate. A consumer that stays mounted (AppBanners, the
     * layout) keeps the shared useAsyncData entry alive, and while it lives a
     * new call with the same key does not refetch. So when the value is past
     * its TTL, or a write invalidated it, start a background refresh. "defer"
     * makes every caller on the same navigation share one request.
     */
    revalidateIfStale(refresh: (opts?: { dedupe?: "cancel" | "defer" }) => Promise<unknown>): void {
      if (import.meta.client && !nuxtApp.isHydrating && store.expired(owner())) {
        void refresh({ dedupe: "defer" });
      }
    },
    getCachedData(dataKey: string, app: NuxtApp, ctx: { cause: FetchCause }): T | undefined {
      if (app.isHydrating) {
        const fromPayload = app.payload.data[dataKey] as T | undefined;
        if (fromPayload !== undefined) store.remember(fromPayload, owner());
        return fromPayload;
      }
      return store.cached(ctx.cause, owner());
    },
  };
}

/** Mark every navigation cache of this app stale; the next page mount refetches. */
export function invalidateSessionCaches(nuxtApp: object): void {
  for (const { cache } of caches.get(nuxtApp)?.values() ?? []) cache.invalidate();
}

/** Keys whose cached value is past its TTL or invalidated, for a background refresh. */
export function expiredSessionCacheKeys(nuxtApp: object): string[] {
  return [...(caches.get(nuxtApp)?.entries() ?? [])]
    .filter(([, { cache, owner }]) => cache.expired(owner()))
    .map(([key]) => key);
}

/**
 * Fetch options for these shared reads: retry transient failures as ofetch
 * does by default, but not a 429. An instant retry lands in the same exhausted
 * bucket and spends another request; the cache answers instead.
 */
export const SHARED_READ_FETCH: { retryStatusCodes: number[] } = {
  retryStatusCodes: [408, 409, 425, 500, 502, 503, 504],
};
