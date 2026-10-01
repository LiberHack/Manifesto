import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { UUID_PATTERN } from "#server/utils/registrationInput";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";

interface Body {
  marketing_email?: unknown;
  sponsor_choice?: unknown;
  recruitment_adult?: unknown;
  withdraw_dietary_note?: unknown;
}

/**
 * Change optional choices from /ops/privacy. Each change appends a consent
 * record; none of them touches participation, so saying No or withdrawing
 * never cancels a registration.
 *
 * `sponsor_choice`: `{ recipient_id, share: boolean }` for one named
 * organisation. A Yes needs `recruitment_adult` (now or already on file).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const body = (await readBody<Body>(event)) ?? {};
  const supabase = useSupabaseAdmin();
  let changed = false;

  if (body.marketing_email !== undefined) {
    if (typeof body.marketing_email !== "boolean") {
      throw createError({ statusCode: 400, message: "marketing_email must be a boolean" });
    }
    const { error } = await supabase.from("consent_records").insert({
      participant_id: user.sub,
      purpose: "marketing_email",
      edition_slug: null,
      decision: body.marketing_email ? "granted" : "withdrawn",
      notice_version: PRIVACY_NOTICE_VERSION,
    });
    if (error) throw createError({ statusCode: 500, message: "Internal server error" });
    changed = true;
  }

  if (body.sponsor_choice !== undefined || body.withdraw_dietary_note === true) {
    const edition = await getCurrentEdition(supabase);
    if (!edition) throw createError({ statusCode: 503, message: "no_live_edition" });

    const choice = body.sponsor_choice as { recipient_id?: unknown; share?: unknown } | undefined;
    if (choice !== undefined) {
      if (
        !choice ||
        typeof choice.recipient_id !== "string" ||
        !UUID_PATTERN.test(choice.recipient_id) ||
        typeof choice.share !== "boolean"
      ) {
        throw createError({ statusCode: 400, message: "sponsor_choice needs a recipient and an explicit Yes or No" });
      }
      const adult = body.recruitment_adult;
      if (adult !== undefined && typeof adult !== "boolean") {
        throw createError({ statusCode: 400, message: "recruitment_adult must be Yes or No" });
      }
      const { error } = await supabase.rpc("set_sponsor_choice", {
        p_participant: user.sub,
        p_edition: edition.slug,
        p_notice_version: PRIVACY_NOTICE_VERSION,
        p_recipient: choice.recipient_id,
        p_grant: choice.share,
        p_recruitment_adult: typeof adult === "boolean" ? adult : null,
      });
      for (const code of ["not_registered", "recipient_not_active", "recruitment_age_required"]) {
        if (error?.message?.includes(code)) {
          throw createError({ statusCode: code === "not_registered" ? 403 : 400, message: code });
        }
      }
      if (error) throw createError({ statusCode: 500, message: "Internal server error" });
      changed = true;
    }

    if (body.withdraw_dietary_note === true) {
      const { error } = await supabase.rpc("withdraw_dietary_note", {
        p_participant: user.sub,
        p_edition: edition.slug,
        p_notice_version: PRIVACY_NOTICE_VERSION,
      });
      if (error) throw createError({ statusCode: 500, message: "Internal server error" });
      changed = true;
    }
  }

  if (!changed) throw createError({ statusCode: 400, message: "No changes" });
  return { ok: true };
});
