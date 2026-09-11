import { describe, it, expect } from "vitest";
import { setup } from "@nuxt/test-utils/e2e";

describe("X-Robots-Tag", async () => {
  await setup({ server: true });

  it("is set outside production (test runs with appEnv=development)", async () => {
    const res = await fetch("http://localhost:3000/");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
