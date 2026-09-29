import { requireRegistration } from "#server/utils/requireRegistration";

/**
 * The caller's applications and the invitations they received in the current
 * edition, newest first. Closed requests stay listed so the outcome and its
 * reason are visible.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);

  const { data, error } = await supabase
    .from("join_requests")
    .select(
      "id, kind, status, close_reason, message, created_at, decided_at, expires_at, " +
        "team:teams(id, name, description, wanted_roles, welcomes_beginners)",
    )
    .eq("participant_id", registration.participant_id)
    .eq("edition_slug", edition.slug)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[me/requests.get] fetch failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }

  const now = Date.now();
  // A pending request past its expiry is shown as expired even before anyone
  // acts on it; decide_join_request closes it for real on the next action.
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    status:
      r.status === "pending" && r.expires_at && Date.parse(r.expires_at as string) <= now
        ? "expired"
        : r.status,
  }));
});
