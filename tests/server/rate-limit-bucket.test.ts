import { describe, expect, it } from "vitest";
import { rateLimitBucket } from "../../server/utils/rateLimitBucket";

describe("rateLimitBucket", () => {
  it("gives signed-in GET and HEAD requests the read budget", () => {
    for (const method of ["GET", "HEAD"]) {
      expect(rateLimitBucket("/api/me", method, true)).toEqual({ binding: "RL_READ", max: 300 });
    }
  });

  it("keeps signed-in writes and anonymous reads on the API budget", () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect(rateLimitBucket("/api/me", method, true)).toEqual({ binding: "RL_API", max: 60 });
    }
    expect(rateLimitBucket("/api/me", "GET", false)).toEqual({ binding: "RL_API", max: 60 });
    expect(rateLimitBucket("/api/me", "HEAD", false)).toEqual({ binding: "RL_API", max: 60 });
  });

  it("applies route limits before the read budget for every method and user", () => {
    for (const signedIn of [true, false]) {
      for (const method of ["GET", "POST"]) {
        expect(rateLimitBucket("/api/invite/code", method, signedIn)).toEqual({
          binding: "RL_INVITE", max: 10,
        });
        expect(rateLimitBucket("/api/skills", method, signedIn)).toEqual({
          binding: "RL_SKILLS", max: 20,
        });
        expect(rateLimitBucket("/api/skills?search=vue", method, signedIn)).toEqual({
          binding: "RL_SKILLS", max: 20,
        });
      }
    }
  });

  it("keeps short links on the API budget", () => {
    for (const signedIn of [true, false]) {
      expect(rateLimitBucket("/go/x", "GET", signedIn)).toEqual({ binding: "RL_API", max: 60 });
    }
  });

  it("uses configured limits only for the general buckets", () => {
    const limits = { apiMax: 70, readMax: 350 };
    expect(rateLimitBucket("/api/me", "GET", true, limits)).toEqual({ binding: "RL_READ", max: 350 });
    expect(rateLimitBucket("/api/me", "POST", true, limits)).toEqual({ binding: "RL_API", max: 70 });
    expect(rateLimitBucket("/api/skills", "GET", true, limits)).toEqual({ binding: "RL_SKILLS", max: 20 });
  });
});
