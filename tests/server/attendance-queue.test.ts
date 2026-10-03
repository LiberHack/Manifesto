import { describe, it, expect } from "vitest";
import { groupFollowUpQueue, type QueueItem } from "../../app/utils/attendanceQueue";

const item = (queue: string, subject_id: string, extra: Partial<QueueItem> = {}): QueueItem => ({
  queue, subject_id, name: `n-${subject_id}`, email: `${subject_id}@example.test`, status: "open", owner_id: null, outcome: null, ...extra,
});

describe("attendance follow-up queue grouping", () => {
  it("shows one card per person, with each of their queues inside it", () => {
    const groups = groupFollowUpQueue([item("unmatched", "p1"), item("uncertain", "p1"), item("unmatched", "p2")]);
    expect(groups.map((g) => g.subject_id)).toEqual(["p1", "p2"]);
    expect(groups[0]!.items.map((i) => i.queue)).toEqual(["unmatched", "uncertain"]);
    expect(groups[0]!.isPerson).toBe(true);
  });

  it("keeps team and request entries apart and without check-in", () => {
    const groups = groupFollowUpQueue([item("unanswered_request", "r1"), item("unconfirmed_team", "t1")]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.isPerson)).toBe(true);
  });

  it("keeps the name and email of the person on the card", () => {
    const [g] = groupFollowUpQueue([item("uncertain", "p1", { name: "Kircho", email: "kircho@example.test" })]);
    expect(g).toMatchObject({ name: "Kircho", email: "kircho@example.test" });
  });
});
