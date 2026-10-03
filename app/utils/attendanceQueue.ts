/** One follow-up entry from GET /api/admin/attendance (`queue`). */
export interface QueueItem {
  queue: string;
  subject_id: string;
  name: string;
  email?: string;
  status: string;
  owner_id: string | null;
  outcome: string | null;
}

export interface QueueGroup {
  subject_id: string;
  name: string;
  email?: string;
  /** A registration (can be checked in), not a team or a request. */
  isPerson: boolean;
  items: QueueItem[];
}

/** Queues whose subject is a registration, so the card can offer check-in. */
const PERSON_QUEUES = new Set(["unmatched", "uncertain"]);

/**
 * One card per subject. A person can be in several queues at once (no team and
 * not confirmed); listing each queue as its own card showed them twice, each
 * with its own check-in buttons. Outreach status stays per queue.
 */
export function groupFollowUpQueue(queue: QueueItem[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const item of queue) {
    const group = groups.get(item.subject_id);
    if (group) {
      group.items.push(item);
      group.isPerson ||= PERSON_QUEUES.has(item.queue);
    } else {
      groups.set(item.subject_id, {
        subject_id: item.subject_id,
        name: item.name,
        email: item.email,
        isPerson: PERSON_QUEUES.has(item.queue),
        items: [item],
      });
    }
  }
  return [...groups.values()];
}
