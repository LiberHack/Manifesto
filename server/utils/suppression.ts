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
