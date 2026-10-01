import { describe, it, expect } from "vitest";
import {
  categorizeReferrerHost,
  computeAttribution,
  isValidLinkTag,
  sofiaDate,
  type Touch,
} from "../../shared/utils/source";

const OWN = "liberhack.org";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-20T12:00:00Z");

function touch(daysAgo: number, source: string, order = 0): Touch {
  return { at: new Date(NOW.getTime() - daysAgo * DAY), source, order };
}

describe("categorizeReferrerHost", () => {
  it("matches exact hosts and real subdomains", () => {
    expect(categorizeReferrerHost("instagram.com", OWN)).toBe("ref-instagram");
    expect(categorizeReferrerHost("l.instagram.com", OWN)).toBe("ref-instagram");
    expect(categorizeReferrerHost("lm.facebook.com", OWN)).toBe("ref-facebook");
    expect(categorizeReferrerHost("t.me", OWN)).toBe("ref-telegram");
    expect(categorizeReferrerHost("WWW.GOOGLE.BG.", OWN)).toBe("ref-google");
  });

  it("does not fall for look-alike or suffix-stuffed domains", () => {
    expect(categorizeReferrerHost("instagram.com.evil.io", OWN)).toBe("ref-other");
    expect(categorizeReferrerHost("notinstagram.com", OWN)).toBe("ref-other");
    expect(categorizeReferrerHost("evil-instagram.com", OWN)).toBe("ref-other");
    expect(categorizeReferrerHost("instagram.com@evil.io", OWN)).toBe("ref-other");
    expect(categorizeReferrerHost("x".repeat(300), OWN)).toBe("ref-other");
  });

  it("treats no referrer as direct and our own host as internal", () => {
    expect(categorizeReferrerHost("", OWN)).toBe("direct");
    expect(categorizeReferrerHost(undefined, OWN)).toBe("direct");
    expect(categorizeReferrerHost("liberhack.org", OWN)).toBeNull();
  });
});

describe("isValidLinkTag", () => {
  it("accepts slug tags", () => {
    expect(isValidLinkTag("poster-fmi")).toBe(true);
    expect(isValidLinkTag("insta-post-3")).toBe(true);
  });

  it("rejects system sources, bad shapes and oversize input", () => {
    for (const tag of ["direct", "unknown", "go", "ref-instagram", "Poster", "a", "-x", "x".repeat(49), 42, null]) {
      expect(isValidLinkTag(tag)).toBe(false);
    }
  });
});

describe("computeAttribution", () => {
  it("drops touches outside the 30-day window before choosing first/last", () => {
    const result = computeAttribution([touch(40, "poster-old"), touch(5, "insta-bio")], NOW);
    expect(result).toEqual({ first: "insta-bio", last: "insta-bio", assisted: [] });
  });

  it("ignores touches after completion", () => {
    expect(computeAttribution([touch(1, "a-tag"), touch(-1, "later")], NOW).last).toBe("a-tag");
  });

  it("never lets a direct return overwrite the last attributable source", () => {
    const result = computeAttribution([touch(3, "poster-fmi"), touch(1, "direct")], NOW);
    expect(result.last).toBe("poster-fmi");
  });

  it("keeps the earliest touch plus the latest nine", () => {
    const touches = Array.from({ length: 15 }, (_, i) => touch(20 - i, `tag-${i}`, i));
    const result = computeAttribution(touches, NOW);
    expect(result.first).toBe("tag-0");
    expect(result.last).toBe("tag-14");
    // Retained: tag-0 + tag-6..tag-14 → assisted excludes the last one.
    expect(result.assisted).toEqual(["tag-0", "tag-6", "tag-7", "tag-8", "tag-9", "tag-10", "tag-11", "tag-12", "tag-13"]);
  });

  it("counts each assisting source once and never the last-touch source", () => {
    const result = computeAttribution(
      [touch(6, "insta-bio", 1), touch(5, "poster-fmi", 2), touch(4, "insta-bio", 3), touch(1, "poster-fmi", 4)],
      NOW,
    );
    expect(result.assisted).toEqual(["insta-bio"]);
  });

  it("separates direct-only from no landing at all", () => {
    expect(computeAttribution([touch(2, "direct")], NOW).first).toBe("direct");
    expect(computeAttribution([], NOW).first).toBe("unknown");
    expect(computeAttribution([touch(31, "poster-fmi")], NOW).first).toBe("unknown");
  });

  it("orders same-hour touches by event id", () => {
    const at = new Date(NOW.getTime() - DAY);
    const result = computeAttribution(
      [{ at, source: "second", order: 2 }, { at, source: "first", order: 1 }],
      NOW,
    );
    expect(result).toEqual({ first: "first", last: "second", assisted: ["first"] });
  });
});

describe("sofiaDate", () => {
  it("reports in Europe/Sofia, not UTC", () => {
    expect(sofiaDate(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
    expect(sofiaDate(new Date("2026-01-15T21:59:00Z"))).toBe("2026-01-15");
  });
});
