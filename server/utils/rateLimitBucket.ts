type RateLimitBucket = { binding: string; max: number };

const ROUTE_LIMITS: [RegExp, RateLimitBucket][] = [
  [/^\/api\/invite\/[^/]+$/, { binding: "RL_INVITE", max: 10 }],
  [/^\/api\/skills$/, { binding: "RL_SKILLS", max: 20 }],
];

export function rateLimitBucket(
  path: string,
  method: string,
  signedIn: boolean,
  limits: { apiMax?: number; readMax?: number } = {},
): RateLimitBucket {
  const pathname = path.split("?", 1)[0] ?? path;
  const route = ROUTE_LIMITS.find(([pattern]) => pattern.test(pathname));
  if (route) return route[1];

  if (pathname.startsWith("/api/") && signedIn && (method === "GET" || method === "HEAD")) {
    return { binding: "RL_READ", max: limits.readMax ?? 300 };
  }

  return { binding: "RL_API", max: limits.apiMax ?? 60 };
}
