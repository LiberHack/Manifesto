export interface CurrentEditionState {
  edition: {
    slug: string;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
  /** The participant cap is reached. No count is exposed — see the API route. */
  full: boolean;
  /** Registration and the whole participant area are open. Admin-controlled. */
  ops_open: boolean;
  /** Analytics consent banner is offered. Admin-controlled, off by default. */
  analytics_enabled: boolean;
}

/** How long a navigation may reuse the edition state (the API caches it for 30s too). */
const EDITION_TTL_MS = 60_000;

/**
 * Shared /api/editions/current state: public, cacheable, and the one source for
 * "can anyone register right now". Keyed so the auth middleware, the signup form
 * and the landing-page call to action resolve it once per request, and reused
 * across client navigations for EDITION_TTL_MS (useSessionCache).
 *
 * A missing or unreadable edition resolves to closed, which is what makes a
 * deploy that runs ahead of its migrations look "not open yet" rather than broken.
 */
export function useCurrentEdition() {
  const request = useRequestFetch();
  // Public data: the same for every visitor, so one owner.
  const owner = () => "public";
  const { cache, getCachedData, revalidateIfStale } = useSessionCache<CurrentEditionState>(
    "edition-current",
    EDITION_TTL_MS,
    owner,
  );

  const edition = useAsyncData<CurrentEditionState>(
    "edition-current",
    () =>
      cache.load(
        () =>
          request<CurrentEditionState>("/api/editions/current", {
            ...SHARED_READ_FETCH,
            // The route sends max-age=30. Skip the browser's HTTP cache so an
            // explicit refresh (after an admin edition change) sees the change;
            // reuse between navigations is useSessionCache's job. Client only:
            // Workers do not implement fetch's `cache` option during SSR.
            ...(import.meta.client ? { cache: "no-cache" as const } : {}),
          }),
        owner(),
      ),
    {
      default: () => ({ edition: null, full: true, ops_open: false, analytics_enabled: false }),
      getCachedData,
    },
  );
  revalidateIfStale(edition.refresh);
  return edition;
}
