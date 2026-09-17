const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

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

const API_PATTERN = /^\/api\//;

function localLimit(ip: string, max: number): number | null {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  entry.count++;
  return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

export default defineEventHandler(async (event) => {
  if (!API_PATTERN.test(event.path)) return;

  // cf-connecting-ip is set by Cloudflare from the actual TCP connection and cannot be spoofed
  const ip =
    getHeader(event, "cf-connecting-ip") ??
    getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const [, routeMax, bindingName] =
    ROUTE_LIMITS.find(([pattern]) => pattern.test(event.path)) ??
    [null, MAX_REQUESTS, "RL_API"];

  const limiter = event.context.cloudflare?.env?.[bindingName] as
    | RateLimitBinding
    | undefined;

  let retryAfter: number | null;
  if (limiter) {
    const { success } = await limiter.limit({ key: ip });
    retryAfter = success ? null : WINDOW_MS / 1000;
  } else {
    retryAfter = localLimit(ip, routeMax);
  }

  if (retryAfter !== null) {
    setHeader(event, "Retry-After", retryAfter);
    throw createError({ statusCode: 429, message: "Too many requests" });
  }
});
