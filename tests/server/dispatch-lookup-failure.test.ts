import { describe, it, expect, vi } from "vitest";

vi.mock("#server/utils/email", () => ({ sendNotice: vi.fn(async () => true) }));

const { dispatchDueJobs } = await import("../../server/utils/notifications");

/**
 * Supabase stand-in: claim returns two jobs, the recipient lookup fails the
 * way PostgREST does on an ambiguous embed, and job updates are recorded.
 */
function stubSupabase() {
  const updates: { id: unknown; patch: Record<string, unknown> }[] = [];
  const jobs = [
    { id: 1, kind: "welcome", registration_id: "r1", dedup_key: "welcome:r1", attempts: 0 },
    { id: 2, kind: "mixer", registration_id: "r2", dedup_key: "mixer:r2", attempts: 1 },
  ];
  const client = {
    rpc: async () => ({ data: jobs, error: null }),
    from(table: string) {
      if (table === "registrations") {
        return {
          select: () => ({
            in: async () => ({
              data: null,
              error: { code: "PGRST201", message: "Could not embed because more than one relationship was found" },
            }),
          }),
        };
      }
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      };
    },
  };
  return { client: client as never, updates };
}

describe("dispatchDueJobs", () => {
  it("retries jobs when the recipient lookup fails instead of cancelling them", async () => {
    const { client, updates } = stubSupabase();

    const result = await dispatchDueJobs(client, 10);

    expect(result).toEqual({ sent: 0, skipped: 0, failed: 2 });
    expect(updates.map((u) => u.patch.status)).toEqual(["failed", "failed"]);
    expect(updates.every((u) => u.patch.last_error === "recipient lookup failed")).toBe(true);
  });
});
