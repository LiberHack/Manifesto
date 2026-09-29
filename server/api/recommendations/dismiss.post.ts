import { requireRegistration } from "#server/utils/requireRegistration";

/**
 * Hide a suggestion for good: `{ team_id }` from a participant, or
 * `{ candidate_id }` from a leader on behalf of their team.
 */
export default defineEventHandler(async (event) => {
  const { registration, edition, supabase } = await requireRegistration(event);
  const body = (await readBody<{ team_id?: unknown; candidate_id?: unknown }>(event)) ?? {};

  let row: { team_id: string; candidate_id: string | null };
  if (typeof body.candidate_id === "string") {
    if (registration.role !== "leader" || !registration.team_id) {
      throw createError({ statusCode: 403, message: "Only team leaders can dismiss candidates" });
    }
    row = { team_id: registration.team_id, candidate_id: body.candidate_id };
  } else if (typeof body.team_id === "string") {
    row = { team_id: body.team_id, candidate_id: null };
  } else {
    throw createError({ statusCode: 400, message: "team_id or candidate_id is required" });
  }

  const { error } = await supabase.from("recommendation_dismissals").insert({
    ...row,
    edition_slug: edition.slug,
    dismissed_by: registration.id,
  });

  // A repeat dismissal is already done; a foreign-key miss means a stale id.
  if (error && error.code !== "23505") {
    if (error.code === "23503") throw createError({ statusCode: 404, message: "Not found" });
    console.error("[recommendations/dismiss] insert failed:", error.message);
    throw createError({ statusCode: 500, message: "Internal server error" });
  }
  return { ok: true };
});
