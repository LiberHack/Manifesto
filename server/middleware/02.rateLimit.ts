const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

const store = new Map<string, { count: number; resetAt: number }>();

const API_PATTERN = /^\/api\//;

export default defineEventHandler((event) => {
  if (!API_PATTERN.test(event.path)) return;

  const ip =
    getHeader(event, "x-forwarded-for")?.split(",")[0].trim() ??
    getHeader(event, "x-real-ip") ??
    "unknown";

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    setHeader(event, "Retry-After", String(retryAfter));
    throw createError({ statusCode: 429, message: "Too many requests" });
  }
});
