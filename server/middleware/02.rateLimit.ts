import { rateLimitKey } from "#server/utils/rateLimitKey";

const WINDOW_MS = 60_000; // 1 minute

// Tighter limits for unauthenticated/expensive endpoints.
// The binding name must match `ratelimits[].name` in wrangler.jsonc.
const ROUTE_LIMITS: [RegExp, number, string][] = [
  [/^\/api\/invite\/[^/]+$/, 10, "RL_INVITE"],
  [/^\/api\/skills$/, 20, "RL_SKILLS"],
];

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

// Fallback for runtimes without Workers rate-limit bindings (nuxt dev, node preview).
const store = new Map<string, { count: number; resetAt: number }>();

// /go/* short links are public, unauthenticated and hit the database, so they
// share the API budget.
const API_PATTERN = /^\/(api|go)\//;

function localLimit(key: string, max: number): number | null {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  entry.count++;
  return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

export default defineEventHandler(async (event) => {
  if (!API_PATTERN.test(event.path)) return;

  const key = rateLimitKey(
    (event.context.user as { sub?: string } | null | undefined)?.sub,
    {
      cfConnectingIp: getHeader(event, "cf-connecting-ip"),
      forwardedFor: getHeader(event, "x-forwarded-for"),
    },
  );

  const maxRequests = Number(useRuntimeConfig(event).rateLimitMax) || 60;
  const [, routeMax, bindingName] =
    ROUTE_LIMITS.find(([pattern]) => pattern.test(event.path)) ??
    [null, maxRequests, "RL_API"];

  const limiter = event.context.cloudflare?.env?.[bindingName] as
    | RateLimitBinding
    | undefined;

  let retryAfter: number | null;
  if (limiter) {
    const { success } = await limiter.limit({ key });
    retryAfter = success ? null : WINDOW_MS / 1000;
  } else {
    // One counter per limit, like the per-binding Workers limiters: a shared
    // counter would charge every /api call against the tighter route limits.
    retryAfter = localLimit(`${bindingName}:${key}`, routeMax);
  }

  if (retryAfter !== null) {
    setHeader(event, "Retry-After", retryAfter);
    throw createError({ statusCode: 429, message: "Too many requests" });
  }
});
