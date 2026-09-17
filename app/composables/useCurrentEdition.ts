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
}

/**
 * Shared /api/editions/current state: public, cacheable, and the one source for
 * "can anyone register right now". Keyed so the auth middleware, the signup form
 * and the landing-page call to action resolve it once per request.
 *
 * A missing or unreadable edition resolves to closed, which is what makes a
 * deploy that runs ahead of its migrations look "not open yet" rather than broken.
 */
export function useCurrentEdition() {
  return useFetch<CurrentEditionState>("/api/editions/current", {
    key: "edition-current",
    default: () => ({ edition: null, full: true, ops_open: false }),
  });
}
