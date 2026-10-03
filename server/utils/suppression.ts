export interface CountCell {
  key: string;
  count: number;
}

export interface SuppressedCell {
  key: string;
  /** null when suppressed. */
  count: number | null;
}

export interface SuppressedTable {
  cells: SuppressedCell[];
  /** null when the total itself would expose a small group. */
  total: number | null;
}

/**
 * Small-group suppression for aggregate reports shared outside the organisers.
 *
 * Any non-zero count below `minGroup` is hidden. When exactly one cell is
 * hidden, the smallest visible non-zero cell is hidden too, so the hidden value
 * cannot be recovered as `total − visible`. The total is withheld when it is
 * itself below `minGroup`. This is a privacy safeguard, not anonymisation.
 */
export function suppressSmallGroups(cells: readonly CountCell[], minGroup: number): SuppressedTable {
  const total = cells.reduce((sum, c) => sum + c.count, 0);
  if (total < minGroup) {
    return { cells: cells.map((c) => ({ key: c.key, count: null })), total: null };
  }

  const hidden = new Set(
    cells.filter((c) => c.count > 0 && c.count < minGroup).map((c) => c.key),
  );
  if (hidden.size === 1) {
    const complement = cells
      .filter((c) => c.count > 0 && !hidden.has(c.key))
      .toSorted((a, b) => a.count - b.count)[0];
    if (complement) hidden.add(complement.key);
  }

  return {
    cells: cells.map((c) => ({ key: c.key, count: hidden.has(c.key) ? null : c.count })),
    total,
  };
}

export interface SponsorReportRow {
  skills: string[];
  experience: string | null;
}

export interface SponsorReport {
  total: number | null;
  experience: SuppressedCell[];
  skills: { skill: string; participants: number }[];
}

const EXPERIENCE_GROUPS = ["beginner", "intermediate", "experienced", "not_set"] as const;

/**
 * The only sponsor-facing aggregate. Experience levels are a partition of the
 * participants and get complementary suppression; skills overlap (one person
 * has several), so each skill is shown only when at least `minGroup` people
 * have it, and never as a complement of anything. Deterministic for the same
 * rows, which — together with the "edition must be final" rule in the route —
 * stops differencing between repeated exports.
 */
export function buildSponsorReport(rows: readonly SponsorReportRow[], minGroup: number): SponsorReport {
  const experienceCells: CountCell[] = EXPERIENCE_GROUPS.map((level) => ({
    key: level,
    count: rows.filter((r) => (r.experience ?? "not_set") === level).length,
  }));
  const experience = suppressSmallGroups(experienceCells, minGroup);

  const skillCounts = new Map<string, number>();
  for (const r of rows) {
    for (const skill of new Set(r.skills.map((s) => s.trim().toLowerCase()))) {
      skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
    }
  }
  const skills = [...skillCounts.entries()]
    .filter(([, count]) => count >= minGroup)
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([skill, participants]) => ({ skill, participants }));

  return { total: experience.total, experience: experience.cells, skills };
}
