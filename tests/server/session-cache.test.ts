import { describe, it, expect } from "vitest";
import { createSessionCache } from "../../app/utils/sessionCache";

function rateLimited(): Error {
  return Object.assign(new Error("Too many requests"), { statusCode: 429 });
}

describe("session cache for shared navigation data", () => {
  it("serves a fresh value to a new page instead of refetching", async () => {
    let now = 1_000;
    const cache = createSessionCache<string>(60_000, () => now);
    await cache.load(async () => "me@1", "user-1");

    now += 30_000;
    expect(cache.cached("initial", "user-1")).toBe("me@1");
  });

  it("refetches once the value is older than the TTL", async () => {
    let now = 1_000;
    const cache = createSessionCache<string>(60_000, () => now);
    await cache.load(async () => "me@1", "user-1");

    now += 60_001;
    expect(cache.cached("initial", "user-1")).toBeUndefined();
  });

  it("always refetches on an explicit refresh or a watched change", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    expect(cache.cached("refresh:manual", "user-1")).toBeUndefined();
    expect(cache.cached("refresh:hook", "user-1")).toBeUndefined();
    expect(cache.cached("watch", "user-1")).toBeUndefined();
  });

  it("never serves one account's value to another", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    expect(cache.cached("initial", "user-2")).toBeUndefined();
    expect(cache.cached("initial", null)).toBeUndefined();
  });

  it("keeps the last value when the refetch is rate limited", async () => {
    let now = 1_000;
    const cache = createSessionCache<string>(60_000, () => now);
    await cache.load(async () => "me@1", "user-1");

    now += 120_000;
    await expect(cache.load(async () => { throw rateLimited(); }, "user-1")).resolves.toBe("me@1");
  });

  it("still surfaces a rate limit when there is nothing to fall back on", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await expect(cache.load(async () => { throw rateLimited(); }, "user-1")).rejects.toThrow("Too many requests");
  });

  it("does not hide other errors behind the cached value", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    const forbidden = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await expect(cache.load(async () => { throw forbidden; }, "user-1")).rejects.toThrow("Forbidden");
  });

  it("does not fall back to another account's value when rate limited", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    await expect(cache.load(async () => { throw rateLimited(); }, "user-2")).rejects.toThrow("Too many requests");
  });
});
