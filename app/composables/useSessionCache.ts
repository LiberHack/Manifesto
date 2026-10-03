import type { NuxtApp } from "#app";
import { createSessionCache, type FetchCause, type SessionCache } from "~/utils/sessionCache";

// One set of caches per Nuxt app: per browser tab on the client, per request
// during SSR, so nothing is shared between visitors on the server.
const caches = new WeakMap<NuxtApp, Map<string, SessionCache<unknown>>>();

/**
 * The navigation cache for `key`, plus a `getCachedData` for useAsyncData that
 * reuses it on page mounts and seeds it from the SSR payload on hydration.
 */
export function useSessionCache<T>(key: string, ttlMs: number, owner: () => string | null) {
  const nuxtApp = useNuxtApp();
  let byKey = caches.get(nuxtApp);
  if (!byKey) caches.set(nuxtApp, (byKey = new Map()));
  let cache = byKey.get(key) as SessionCache<T> | undefined;
  if (!cache) byKey.set(key, (cache = createSessionCache<T>(ttlMs)) as SessionCache<unknown>);
  const store = cache;

  return {
    cache: store,
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

/**
 * Fetch options for these shared reads: retry transient failures as ofetch
 * does by default, but not a 429. An instant retry lands in the same exhausted
 * bucket and spends another request; the cache answers instead.
 */
export const SHARED_READ_FETCH: { retryStatusCodes: number[] } = {
  retryStatusCodes: [408, 409, 425, 500, 502, 503, 504],
};
