// Deterministic team/participant matching. The weights are the plan's starting
// hypotheses, not measured optima. Signals a side has not filled in are
// "unknown" and drop out of the weighting rather than counting against anyone.

import {
  CONTRIBUTION_ROLE_LABELS,
  formatGoals,
  UNDECIDED_INTEREST,
  type ContributionRole,
  type ParticipantGoal,
} from "./teamFormation";

export const WEIGHTS = {
  contribution: 0.45,
  interests: 0.25,
  goals: 0.2,
  experience: 0.1,
} as const;

/** Candidates whose scores are this close count as equally suitable. */
export const TIE_BAND = 0.05;

export interface PersonSignals {
  skills: string[];
  preferred_roles: ContributionRole[];
  interests: string[];
  goals: ParticipantGoal[];
  experience: "beginner" | "intermediate" | "experienced" | null;
  languages: string[];
}

export interface TeamSignals {
  skills_wanted: string[];
  wanted_roles: ContributionRole[];
  interests: string[];
  goals: ParticipantGoal[];
  welcomes_beginners: boolean;
  languages: string[];
}

export interface Match {
  /** 0..1 over the signals both sides provided; null when none overlap in kind. */
  score: number | null;
  /** Human-readable evidence, strongest first. */
  reasons: string[];
  /** A declared hard requirement is not met; never shown. */
  excluded: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

function overlap(a: string[], b: string[]): string[] {
  const bs = new Set(b.map(norm));
  return a.filter((x) => bs.has(norm(x)));
}

function meaningfulInterests(list: string[]): string[] {
  return list.filter((i) => norm(i) !== UNDECIDED_INTEREST);
}

/**
 * Score how well a person fits a team. Symmetric in spirit: the same number
 * ranks teams for a person and people for a team.
 */
export function scoreMatch(person: PersonSignals, team: TeamSignals): Match {
  // Working languages are the one hard requirement: only when both sides
  // declared some and they share none.
  if (
    person.languages.length > 0 &&
    team.languages.length > 0 &&
    overlap(person.languages, team.languages).length === 0
  ) {
    return { score: null, reasons: [], excluded: true };
  }

  const parts: Array<{ weight: number; value: number }> = [];
  const reasons: string[] = [];

  // Contribution: explicit wanted roles first, then wanted skills.
  const contribution: number[] = [];
  if (team.wanted_roles.length > 0 && person.preferred_roles.length > 0) {
    const direct = team.wanted_roles.filter((r) => person.preferred_roles.includes(r));
    const flexible = person.preferred_roles.includes("flexible");
    contribution.push(
      direct.length > 0
        ? direct.length / team.wanted_roles.length
        : flexible
          ? 0.5
          : 0,
    );
    if (direct.length > 0) {
      reasons.push(
        `Wanted role: ${direct.map((r) => CONTRIBUTION_ROLE_LABELS[r]).join(", ")}`,
      );
    } else if (flexible) {
      reasons.push("Flexible about roles");
    }
  }
  if (team.skills_wanted.length > 0 && person.skills.length > 0) {
    const shared = overlap(team.skills_wanted, person.skills);
    contribution.push(shared.length / Math.min(team.skills_wanted.length, 3));
    if (shared.length > 0) reasons.push(`Wanted skills: ${shared.slice(0, 3).join(", ")}`);
  }
  if (contribution.length > 0) {
    const value = Math.min(1, contribution.reduce((a, b) => a + b, 0) / contribution.length);
    parts.push({ weight: WEIGHTS.contribution, value });
  }

  const personInterests = meaningfulInterests(person.interests);
  const teamInterests = meaningfulInterests(team.interests);
  if (personInterests.length > 0 && teamInterests.length > 0) {
    const shared = overlap(teamInterests, personInterests);
    parts.push({
      weight: WEIGHTS.interests,
      value: shared.length / Math.min(personInterests.length, teamInterests.length),
    });
    if (shared.length > 0) reasons.push(`Shared interest: ${shared.join(", ")}`);
  }

  if (person.goals.length > 0 && team.goals.length > 0) {
    const shared = team.goals.filter((g) => person.goals.includes(g));
    parts.push({
      weight: WEIGHTS.goals,
      value: shared.length / Math.min(person.goals.length, team.goals.length),
    });
    if (shared.length > 0) {
      reasons.push(`Both here for: ${formatGoals(shared)}`);
    }
  }

  // Experience is compatibility, not rank: only a beginner joining a team that
  // did not say it welcomes beginners scores lower.
  if (person.experience) {
    const beginner = person.experience === "beginner";
    parts.push({
      weight: WEIGHTS.experience,
      value: beginner && !team.welcomes_beginners ? 0.5 : 1,
    });
    if (beginner && team.welcomes_beginners) reasons.push("Team welcomes beginners");
  }

  if (parts.length === 0) {
    return { score: null, reasons: [], excluded: false };
  }

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = parts.reduce((a, p) => a + p.weight * p.value, 0) / totalWeight;
  return { score: Math.round(score * 1000) / 1000, reasons, excluded: false };
}

/** FNV-1a, for a stable per-viewer, per-day shuffle. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Ranked<T> {
  item: T;
  match: Match;
}

/**
 * Order scored items: best score first, unknown scores last. Within a tie band
 * the item shown least recently to anyone comes first, then a per-viewer daily
 * shuffle — so similarly suitable profiles share the attention instead of the
 * same few receiving every invitation.
 */
export function rankMatches<T>(
  items: Array<Ranked<T>>,
  opts: {
    id: (item: T) => string;
    /** Recent exposure count per id, across all viewers. */
    exposures: Map<string, number>;
    viewerId: string;
    day: string;
    limit: number;
  },
): Array<Ranked<T>> {
  const band = (score: number | null) =>
    score === null ? -1 : Math.floor(score / TIE_BAND);

  return items
    .filter((r) => !r.match.excluded)
    .sort((a, b) => {
      const byBand = band(b.match.score) - band(a.match.score);
      if (byBand !== 0) return byBand;
      const idA = opts.id(a.item);
      const idB = opts.id(b.item);
      const byExposure = (opts.exposures.get(idA) ?? 0) - (opts.exposures.get(idB) ?? 0);
      if (byExposure !== 0) return byExposure;
      return hash(`${opts.viewerId}:${opts.day}:${idA}`) - hash(`${opts.viewerId}:${opts.day}:${idB}`);
    })
    .slice(0, opts.limit);
}
