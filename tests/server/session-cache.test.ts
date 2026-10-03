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

  it("after a write, the next page mount refetches, but a 429 can still fall back", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    cache.invalidate();
    expect(cache.cached("initial", "user-1")).toBeUndefined();
    await expect(cache.load(async () => { throw rateLimited(); }, "user-1")).resolves.toBe("me@1");
  });

  it("reports when the shared value should be revalidated", async () => {
    let now = 1_000;
    const cache = createSessionCache<string>(30_000, () => now);
    expect(cache.expired("user-1")).toBe(false); // nothing cached: the first fetch handles it

    await cache.load(async () => "me@1", "user-1");
    expect(cache.expired("user-1")).toBe(false);
    now += 30_001;
    expect(cache.expired("user-1")).toBe(true);

    await cache.load(async () => "me@2", "user-1");
    cache.invalidate();
    expect(cache.expired("user-1")).toBe(true);
    // Another account's entry is the user watch's job, not revalidation.
    expect(cache.expired("user-2")).toBe(false);
  });

  it("a read that started before a write does not mark its old result fresh", async () => {
    const cache = createSessionCache<string>(60_000, () => 1_000);
    await cache.load(async () => "me@1", "user-1");

    let finish!: (v: string) => void;
    const inFlight = cache.load(() => new Promise<string>((r) => (finish = r)), "user-1");
    cache.invalidate(); // the write lands while the read is in flight
    finish("me@stale");
    await expect(inFlight).resolves.toBe("me@stale");

    expect(cache.cached("initial", "user-1")).toBeUndefined();
    expect(cache.expired("user-1")).toBe(true);
  });
});
