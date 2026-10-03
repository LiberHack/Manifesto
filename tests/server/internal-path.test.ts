import { describe, it, expect } from "vitest";
import { internalPath } from "~/utils/registrationGate";

describe("internalPath — ?next= sanitizer", () => {
  it("keeps same-site paths with their query", () => {
    expect(internalPath("/ops/dashboard")).toBe("/ops/dashboard");
    expect(internalPath("/ops/invite/abc?x=1")).toBe("/ops/invite/abc?x=1");
  });

  it("rejects anything that could leave the site", () => {
    for (const value of ["//evil.io", "/\\evil.io", "https://evil.io", "evil.io", "", undefined, ["/ops/teams"]]) {
      expect(internalPath(value)).toBeNull();
    }
  });
});
