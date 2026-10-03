import { describe, it, expect } from "vitest";
import {
  rankMatches,
  scoreMatch,
  type PersonSignals,
  type TeamSignals,
} from "../../shared/recommendations";

const person = (over: Partial<PersonSignals> = {}): PersonSignals => ({
  skills: [],
  preferred_roles: [],
  interests: [],
  goals: [],
  experience: null,
  languages: [],
  ...over,
});

const team = (over: Partial<TeamSignals> = {}): TeamSignals => ({
  skills_wanted: [],
  wanted_roles: [],
  interests: [],
  goals: [],
  welcomes_beginners: false,
  languages: [],
  ...over,
});

describe("scoreMatch", () => {
  it("returns an unknown score, not zero, when there is nothing to compare", () => {
    expect(scoreMatch(person(), team())).toEqual({ score: null, reasons: [], excluded: false });
  });

  it("normalises over the signals both sides provided", () => {
    // Only interests are comparable, and they match fully.
    const m = scoreMatch(person({ interests: ["climate"] }), team({ interests: ["Climate"] }));
    expect(m.score).toBe(1);
    expect(m.reasons).toEqual(["Shared interest: Climate"]);
  });

  it("weights contribution 45, interests 25, goals 20, experience 10", () => {
    const m = scoreMatch(
      person({
        preferred_roles: ["backend"],
        interests: ["health"],
        goals: ["learning"],
        experience: "intermediate",
      }),
      team({ wanted_roles: ["backend"], interests: ["climate"], goals: ["competing"] }),
    );
    // contribution 1*0.45 + interests 0*0.25 + goals 0*0.2 + experience 1*0.1
    expect(m.score).toBe(0.55);
  });

  it("gives flexible people partial credit for any wanted role", () => {
    const m = scoreMatch(person({ preferred_roles: ["flexible"] }), team({ wanted_roles: ["design"] }));
    expect(m.score).toBe(0.5);
    expect(m.reasons).toContain("Flexible about roles");
  });

  it("treats 'undecided' interests as unknown", () => {
    const m = scoreMatch(person({ interests: ["undecided"] }), team({ interests: ["climate"] }));
    expect(m.score).toBeNull();
  });

  it("scores beginners lower only for teams that did not welcome them", () => {
    const welcoming = scoreMatch(person({ experience: "beginner" }), team({ welcomes_beginners: true }));
    const other = scoreMatch(person({ experience: "beginner" }), team());
    expect(welcoming.score).toBe(1);
    expect(welcoming.reasons).toContain("Team welcomes beginners");
    expect(other.score).toBe(0.5);
    expect(scoreMatch(person({ experience: "experienced" }), team()).score).toBe(1);
  });

  it("excludes a pair only when both declared languages and share none", () => {
    expect(scoreMatch(person({ languages: ["Bulgarian"] }), team({ languages: ["English"] })).excluded).toBe(true);
    expect(scoreMatch(person(), team({ languages: ["English"] })).excluded).toBe(false);
  });

  it("matches wanted skills case-insensitively", () => {
    const m = scoreMatch(person({ skills: ["rust", "Go"] }), team({ skills_wanted: ["Rust"] }));
    expect(m.score).toBe(1);
    expect(m.reasons).toEqual(["Wanted skills: Rust"]);
  });
});

describe("rankMatches", () => {
  const scored = (id: string, score: number | null) => ({
    item: { id },
    match: { score, reasons: [], excluded: false },
  });
  const base = { id: (x: { id: string }) => x.id, viewerId: "v", day: "2026-10-01", limit: 10 };

  it("puts better scores first and unknown scores last", () => {
    const out = rankMatches([scored("a", null), scored("b", 0.2), scored("c", 0.9)], {
      ...base,
      exposures: new Map(),
    });
    expect(out.map((r) => r.item.id)).toEqual(["c", "b", "a"]);
  });

  it("rotates equally suitable candidates towards the least shown", () => {
    const out = rankMatches([scored("a", 0.81), scored("b", 0.82)], {
      ...base,
      exposures: new Map([["b", 5], ["a", 1]]),
    });
    expect(out.map((r) => r.item.id)).toEqual(["a", "b"]);
  });

  it("drops excluded pairs and honours the limit", () => {
    const out = rankMatches(
      [
        { item: { id: "x" }, match: { score: null, reasons: [], excluded: true } },
        scored("a", 0.5),
        scored("b", 0.4),
      ],
      { ...base, exposures: new Map(), limit: 1 },
    );
    expect(out.map((r) => r.item.id)).toEqual(["a"]);
  });
});
