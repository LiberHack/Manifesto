import { describe, it, expect } from "vitest";
import { rateLimitKey } from "../../server/utils/rateLimitKey";

describe("rateLimitKey", () => {
  it("gives two signed-in users behind one IP separate buckets", () => {
    const venue = { cfConnectingIp: "203.0.113.7" };
    expect(rateLimitKey("user-a", venue)).not.toBe(rateLimitKey("user-b", venue));
  });

  it("keeps one user in one bucket across IPs", () => {
    expect(rateLimitKey("user-a", { cfConnectingIp: "203.0.113.7" })).toBe(
      rateLimitKey("user-a", { cfConnectingIp: "198.51.100.9" }),
    );
  });

  it("keys anonymous requests by IP, preferring cf-connecting-ip", () => {
    expect(rateLimitKey(null, { cfConnectingIp: "203.0.113.7", forwardedFor: "10.0.0.1" })).toBe(
      "ip:203.0.113.7",
    );
    expect(rateLimitKey(undefined, { forwardedFor: "198.51.100.9, 10.0.0.1" })).toBe(
      "ip:198.51.100.9",
    );
    expect(rateLimitKey(null, {})).toBe("ip:unknown");
  });
});
