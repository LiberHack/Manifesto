const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

// Tighter limits for unauthenticated/expensive endpoints
const ROUTE_LIMITS: [RegExp, number][] = [
  [/^\/api\/invite\/[^/]+$/, 10],
  [/^\/api\/skills$/, 20],
];

const store = new Map<string, { count: number; resetAt: number }>();

const API_PATTERN = /^\/api\//;

export default defineEventHandler((event) => {
  if (!API_PATTERN.test(event.path)) return;

  // x-real-ip is set by Caddy from the actual TCP connection and cannot be spoofed
  const ip =
    getHeader(event, "x-real-ip") ??
    getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const routeMax =
    ROUTE_LIMITS.find(([pattern]) => pattern.test(event.path))?.[1] ??
    MAX_REQUESTS;

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;

  if (entry.count > routeMax) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    setHeader(event, "Retry-After", retryAfter);
    throw createError({ statusCode: 429, message: "Too many requests" });
  }
});
