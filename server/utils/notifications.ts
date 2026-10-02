import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotice } from "#server/utils/email";

/**
 * Durable notification delivery. Jobs are queued with a unique dedup key by
 * whatever creates the need (a seat offer, a registration, the reminder
 * queue); `dispatchDueJobs` claims due jobs (leased, SKIP LOCKED), renders
 * them with the handler for their kind, and records the outcome.
 *
 * A handler re-checks relevance at send time and returns "skip" when the
 * notice no longer applies (offer already answered, request resolved), so a
 * late retry never sends something stale.
 */

export interface NotificationJob {
  id: number;
  edition_slug: string;
  registration_id: string;
  kind: string;
  dedup_key: string;
  attempts: number;
  created_at: string;
}

interface Recipient {
  id: string;
  team_id: string | null;
  seat_state: string;
  offer_expires_at: string | null;
  offer_attempts: number;
  intention_at: string | null;
  participant: { name: string; email: string } | null;
  edition: {
    name: string;
    starts_at: string | null;
    arrival_host: string | null;
    team_formation_slot: string | null;
  } | null;
}

type Notice = { subject: string; body: string; path: string; linkLabel: string };
type Outcome = Notice | "skip";

type Handler = (
  job: NotificationJob,
  r: Recipient,
  supabase: SupabaseClient,
) => Promise<Outcome> | Outcome;

const MAX_ATTEMPTS = 5;

/**
 * Whether a seat_offer job is about the offer the registration holds now.
 *
 * Each offer queues its own job, keyed `seat_offer:<edition>:<registration>:<attempt>`.
 * A job from an earlier, expired offer that is still pending or retrying must
 * not announce the current one, or the person gets two emails for it.
 */
export function isCurrentSeatOffer(
  job: Pick<NotificationJob, "dedup_key">,
  r: Pick<Recipient, "seat_state" | "offer_expires_at" | "offer_attempts">,
  now = Date.now(),
): boolean {
  if (r.seat_state !== "offered" || !r.offer_expires_at) return false;
  if (Date.parse(r.offer_expires_at) <= now) return false;
  return job.dedup_key.split(":").at(-1) === String(r.offer_attempts);
}

function when(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/Sofia",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "soon";
}

const HANDLERS: Record<string, Handler> = {
  welcome: (_job, r) => ({
    subject: `You're registered for ${r.edition?.name ?? "LiberHack"}`,
    body:
      r.seat_state === "waitlisted"
        ? `Thanks for registering for ${r.edition?.name}. The event is full right now, so you are on the waitlist; we'll email you as soon as a seat opens. Meanwhile you can fill in your profile.`
        : `You're in for ${r.edition?.name}. Next step: finish your profile and find a team — or tell us you'd like help finding one.`,
    path: "/ops/dashboard",
    linkLabel: "Open your dashboard",
  }),

  seat_offer: (job, r) => {
    if (!isCurrentSeatOffer(job, r)) return "skip";
    return {
      subject: `A seat opened for you at ${r.edition?.name ?? "LiberHack"}`,
      body: `A place opened up and it's yours if you want it. Accept it before ${when(r.offer_expires_at)} (Sofia time); after that it goes to the next person on the waitlist.`,
      path: "/ops/dashboard#attendance",
      linkLabel: "Accept your seat",
    };
  },

  mixer: (_job, r) => {
    if (r.team_id || !["accepted", "offered"].includes(r.seat_state)) return "skip";
    return {
      subject: "Still looking for a team? Come to the team mixer",
      body: `${r.edition?.name} is coming up and you don't have a team yet. Join the team-formation slot on ${when(r.edition?.team_formation_slot ?? null)}, browse suggested teams, or ask the organizers to help you find one.`,
      path: "/ops/dashboard#no-team",
      linkLabel: "See suggested teams",
    };
  },

  reconfirm: (job, r) => {
    if (r.seat_state !== "accepted") return "skip";
    // Answered since the reminder was queued: nothing to ask.
    if (r.intention_at && Date.parse(r.intention_at) >= Date.parse(job.created_at)) return "skip";
    return {
      subject: `Are you still coming to ${r.edition?.name ?? "LiberHack"}?`,
      body: `Please confirm whether you're coming, unsure, or can't make it. If something is in the way — transport, equipment, timing — tell us privately and we'll try to help.`,
      path: "/ops/dashboard#attendance",
      linkLabel: "Confirm attendance",
    };
  },

  arrival: (_job, r) => {
    if (r.seat_state !== "accepted") return "skip";
    const host = r.edition?.arrival_host ? ` Ask for ${r.edition.arrival_host} when you arrive.` : "";
    return {
      subject: `${r.edition?.name ?? "LiberHack"} starts ${when(r.edition?.starts_at ?? null)}`,
      body: `See you soon! Check the programme for the schedule, food and what to bring (laptop and charger).${host}`,
      path: "/programme",
      linkLabel: "Programme",
    };
  },

  leader_unanswered: async (job, _r, supabase) => {
    // dedup_key is leader_unanswered:<edition>:<request id>
    const requestId = job.dedup_key.split(":").at(-1)!;
    const { data } = await supabase
      .from("join_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    if (data?.status !== "pending") return "skip";
    return {
      subject: "Someone is waiting for your answer",
      body: "An application to your team has been waiting for a while. Accept, reject, or reply with a question — either way, they can move on.",
      path: "/ops/dashboard#pending-requests",
      linkLabel: "Review applications",
    };
  },
};

/** Register a handler for another job kind (e.g. chat digests). */
export function registerNotificationHandler(kind: string, handler: Handler): void {
  HANDLERS[kind] = handler;
}

/**
 * Record a failed attempt with exponential backoff; after MAX_ATTEMPTS the job
 * stays failed and surfaces in the organizers' contact-failure queue.
 */
async function markFailed(
  supabase: SupabaseClient,
  job: NotificationJob,
  reason: string,
): Promise<void> {
  await supabase
    .from("notification_jobs")
    .update({
      status: "failed",
      last_error: reason,
      next_attempt_at: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString(),
    })
    .eq("id", job.id);
}

export interface DispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Deliver up to `limit` due jobs. Safe to run concurrently and repeatedly.
 * Logs job ids and counts only, never addresses or message content.
 */
export async function dispatchDueJobs(
  supabase: SupabaseClient,
  limit = 50,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, skipped: 0, failed: 0 };

  const { data: jobs, error } = await supabase.rpc("claim_notification_jobs", { p_limit: limit });
  if (error) {
    console.error("[notifications] claim failed:", error.message);
    return result;
  }
  const claimed = (jobs ?? []) as NotificationJob[];
  if (claimed.length === 0) return result;

  // The edition embed names its foreign key: attendance_snapshots is a second
  // registrations <-> editions path, and an unqualified embed is ambiguous
  // (PostgREST 300, PGRST201).
  const { data: rows, error: lookupError } = await supabase
    .from("registrations")
    .select(
      "id, team_id, seat_state, offer_expires_at, offer_attempts, intention_at, " +
        "participant:participants(name, email), " +
        "edition:editions!registrations_edition_slug_fkey(name, starts_at, arrival_host, team_formation_slot)",
    )
    .in("id", [...new Set(claimed.map((j) => j.registration_id))]);

  // A failed lookup says nothing about relevance: retry the jobs later rather
  // than cancelling them as if every recipient had gone.
  if (lookupError) {
    console.error("[notifications] recipient lookup failed:", lookupError.message);
    for (const job of claimed) await markFailed(supabase, job, "recipient lookup failed");
    result.failed += claimed.length;
    return result;
  }
  const recipients = new Map(
    ((rows ?? []) as unknown as Recipient[]).map((r) => [r.id, r]),
  );

  for (const job of claimed) {
    const handler = HANDLERS[job.kind];
    const recipient = recipients.get(job.registration_id);
    let outcome: Outcome | "unknown" = "unknown";
    let delivered = false;

    try {
      if (!handler || !recipient?.participant?.email) {
        outcome = "skip";
      } else {
        outcome = await handler(job, recipient, supabase);
        if (outcome !== "skip") {
          delivered = await sendNotice(recipient.participant.email, outcome);
        }
      }
    } catch (e) {
      console.error(`[notifications] job ${job.id} (${job.kind}) threw:`, (e as Error).message);
    }

    if (outcome === "skip") {
      await supabase
        .from("notification_jobs")
        .update({ status: "cancelled", last_error: handler ? "no longer relevant" : "unknown kind" })
        .eq("id", job.id);
      result.skipped++;
    } else if (delivered) {
      await supabase
        .from("notification_jobs")
        .update({ status: "sent", delivered_at: new Date().toISOString(), last_error: null })
        .eq("id", job.id);
      result.sent++;
    } else {
      await markFailed(supabase, job, "delivery failed");
      result.failed++;
    }
  }

  if (result.failed > 0 && claimed.some((j) => j.attempts >= MAX_ATTEMPTS)) {
    console.error(`[notifications] ${result.failed} job(s) failed; some exhausted retries`);
  }
  return result;
}
