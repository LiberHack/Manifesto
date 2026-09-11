import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("X-Robots-Tag", () => {
  it("is set outside production (test runs with appEnv=development)", async () => {
    const res = await fetch("/");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
