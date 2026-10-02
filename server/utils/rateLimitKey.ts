/**
 * The bucket a request is rate-limited in.
 *
 * Signed-in requests are keyed per user, not per IP: many attendees behind one
 * venue NAT (and chat polling) would otherwise share a single bucket and 429.
 * Anonymous requests fall back to the client IP. `cf-connecting-ip` is set by
 * Cloudflare from the TCP connection and cannot be spoofed; `x-forwarded-for`
 * only applies off Cloudflare (nuxt dev, node preview).
 */
export function rateLimitKey(
  userId: string | null | undefined,
  headers: { cfConnectingIp?: string | null; forwardedFor?: string | null },
): string {
  if (userId) return `user:${userId}`;
  const ip =
    headers.cfConnectingIp ??
    headers.forwardedFor?.split(",")[0]?.trim() ??
    "unknown";
  return `ip:${ip}`;
}
