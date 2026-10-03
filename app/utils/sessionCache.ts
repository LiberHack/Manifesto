/** Why useAsyncData is asking for data (mirrors Nuxt's AsyncDataRequestContext). */
export type FetchCause = "initial" | "refresh:hook" | "refresh:manual" | "watch";

interface Entry<T> {
  at: number;
  owner: string | null;
  value: T;
}

export interface SessionCache<T> {
  /**
   * The value to reuse instead of fetching, if any. Only a page or middleware
   * mounting (`initial`) reuses it; an explicit refresh or a watched change
   * (sign-in, sign-out) always fetches.
   */
  cached(cause: FetchCause, owner: string | null): T | undefined;
  /** Fetch and remember. A 429 falls back to the last value for the same owner. */
  load(fetcher: () => Promise<T>, owner: string | null): Promise<T>;
  /** Remember a value obtained elsewhere (the SSR payload on hydration). */
  remember(value: T, owner: string | null): void;
}

function isRateLimited(error: unknown): boolean {
  const e = error as { statusCode?: number; status?: number } | null;
  return e?.statusCode === 429 || e?.status === 429;
}

/**
 * Short-lived cache for data every navigation asks for (`/api/me`,
 * `/api/editions/current`). Without it each page and the auth middleware
 * refetch them, which spends the per-user API rate limit on repeats; and when a
 * repeat is rate limited, useAsyncData resets the data to its default, so the
 * page briefly loses the signed-in user or sees the edition as closed.
 *
 * `owner` is the signed-in user id (null when signed out), so one account's
 * value is never served to another.
 */
export function createSessionCache<T>(ttlMs: number, now: () => number = Date.now): SessionCache<T> {
  let entry: Entry<T> | null = null;

  const remember = (value: T, owner: string | null) => {
    entry = { at: now(), owner, value };
  };

  return {
    cached(cause, owner) {
      if (cause !== "initial" || !entry || entry.owner !== owner) return undefined;
      return now() - entry.at <= ttlMs ? entry.value : undefined;
    },
    async load(fetcher, owner) {
      try {
        const value = await fetcher();
        remember(value, owner);
        return value;
      } catch (error) {
        if (isRateLimited(error) && entry && entry.owner === owner) return entry.value;
        throw error;
      }
    },
    remember,
  };
}
