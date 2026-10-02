import { describe, it, expect } from "vitest";
import {
  parseContact,
  parseProfileFields,
  parseProfileUrl,
  parseRequestMessage,
  parseTeamRecruitmentFields,
} from "../../server/utils/profileInput";
import { normalizeSkills } from "../../server/utils/skillNormalize";
import { teamVacancies } from "../../shared/teamFormation";

const bad = { statusCode: 400 };

describe("parseProfileFields", () => {
  it("only returns the fields that were sent", () => {
    expect(parseProfileFields({ intro: "  hi  " })).toEqual({ intro: "hi" });
  });

  it("accepts the discovery statuses and clears with null", () => {
    expect(parseProfileFields({ matching_status: "looking" }).matching_status).toBe("looking");
    expect(parseProfileFields({ matching_status: null }).matching_status).toBeNull();
    expect(() => parseProfileFields({ matching_status: "public" })).toThrow();
  });

  it("validates roles and goals against the enums, de-duplicating", () => {
    expect(
      parseProfileFields({ preferred_roles: ["backend", "backend", "flexible"] }).preferred_roles,
    ).toEqual(["backend", "flexible"]);
    expect(() => parseProfileFields({ goals: ["fame"] })).toThrow();
  });

  it("caps challenge interests at three, ignoring case duplicates", () => {
    expect(
      parseProfileFields({ interests: ["Climate", "climate", "Health", "undecided"] }).interests,
    ).toEqual(["Climate", "Health", "undecided"]);
    expect(() => parseProfileFields({ interests: ["a", "b", "c", "d"] })).toThrow();
  });

  it("rejects an intro over 500 characters", () => {
    expect(() => parseProfileFields({ intro: "x".repeat(501) })).toThrow();
  });
});

describe("parseProfileUrl", () => {
  it("accepts http(s) links, including self-hosted GitLab", () => {
    expect(parseProfileUrl("https://gitlab.example.org/ada", "gitlab_url")).toBe(
      "https://gitlab.example.org/ada",
    );
  });

  it("treats blank as no link", () => {
    expect(parseProfileUrl("  ", "github_url")).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(() => parseProfileUrl("javascript:alert(1)", "portfolio_url")).toThrow();
    expect(() => parseProfileUrl("ftp://example.org", "portfolio_url")).toThrow();
    expect(() => parseProfileUrl("not a url", "portfolio_url")).toThrow();
  });
});

describe("parseContact", () => {
  it("allows the explicit email-only exception without a handle", () => {
    expect(parseContact({ method: "email_only" })).toEqual({
      method: "email_only",
      handle: null,
      other_label: null,
      share_with_team: false,
    });
  });

  it("requires a handle for messenger methods", () => {
    expect(() => parseContact({ method: "telegram", handle: " " })).toThrow();
    expect(parseContact({ method: "telegram", handle: "@ada" }).handle).toBe("@ada");
  });

  it("checks that a phone number looks like one", () => {
    expect(() => parseContact({ method: "phone", handle: "call me" })).toThrow();
    expect(parseContact({ method: "phone", handle: "+359 88 123 4567" }).handle).toBe(
      "+359 88 123 4567",
    );
  });

  it("needs the channel name for Other", () => {
    expect(() => parseContact({ method: "other", handle: "ada" })).toThrow();
    expect(parseContact({ method: "other", handle: "ada", other_label: "Matrix" }).other_label).toBe(
      "Matrix",
    );
  });

  it("rejects a missing or unknown method", () => {
    expect(() => parseContact(undefined)).toThrow();
    expect(() => parseContact({ method: "fax", handle: "1" })).toThrow();
  });
});

describe("parseRequestMessage", () => {
  it("requires 20–500 characters after trimming", () => {
    expect(() => parseRequestMessage("   short    ")).toThrow(expect.objectContaining(bad));
    expect(() => parseRequestMessage("x".repeat(501))).toThrow();
    expect(parseRequestMessage("  I can help with the frontend.  ")).toBe(
      "I can help with the frontend.",
    );
  });
});

describe("parseTeamRecruitmentFields", () => {
  it("limits the desired size to 1–6", () => {
    expect(parseTeamRecruitmentFields({ desired_size: 4 }).desired_size).toBe(4);
    expect(() => parseTeamRecruitmentFields({ desired_size: 7 })).toThrow();
    expect(() => parseTeamRecruitmentFields({ desired_size: 2.5 })).toThrow();
  });

  it("type-checks the flags", () => {
    expect(parseTeamRecruitmentFields({ recruiting: false })).toEqual({ recruiting: false });
    expect(() => parseTeamRecruitmentFields({ welcomes_beginners: "yes" })).toThrow();
  });
});

describe("normalizeSkills", () => {
  const catalogue = ["JavaScript", "Rust", "PostgreSQL", "Svelte"];

  it("uses the catalogue's spelling for case variants", () => {
    expect(normalizeSkills(["rust", "SVELTE"], catalogue)).toEqual(["Rust", "Svelte"]);
  });

  it("folds common aliases", () => {
    expect(normalizeSkills(["js", "postgres", "k8s"], catalogue)).toEqual([
      "JavaScript",
      "PostgreSQL",
      "Kubernetes",
    ]);
  });

  it("keeps free-text skills and collapses duplicates", () => {
    expect(normalizeSkills(["Lean  4", "JavaScript", "javascript", ""], catalogue)).toEqual([
      "Lean 4",
      "JavaScript",
    ]);
  });
});

describe("teamVacancies", () => {
  it("derives open places from desired size and membership", () => {
    expect(teamVacancies(4, 1)).toBe(3);
    expect(teamVacancies(4, 5)).toBe(0);
  });
});
