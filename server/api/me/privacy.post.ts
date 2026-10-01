import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import { getCurrentEdition } from "#server/utils/registrationContext";
import { PRIVACY_NOTICE_VERSION } from "#shared/utils/privacy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  marketing_email?: unknown;
  sponsor_acknowledge_recipient_ids?: unknown;
  withdraw_dietary_note?: unknown;
}

/**
 * Change optional choices from /ops/privacy. Each change appends a consent
 * record; none of them touches the registration itself, so withdrawing never
 * cancels participation.
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

  if (body.sponsor_acknowledge_recipient_ids !== undefined || body.withdraw_dietary_note === true) {
    const edition = await getCurrentEdition(supabase);
    if (!edition) throw createError({ statusCode: 503, message: "no_live_edition" });

    const { data: registration } = await supabase
      .from("registrations")
      .select("id")
      .eq("participant_id", user.sub)
      .eq("edition_slug", edition.slug)
      .maybeSingle();
    if (!registration) throw createError({ statusCode: 403, message: "not_registered" });

    const ids = body.sponsor_acknowledge_recipient_ids;
    if (ids !== undefined) {
      if (
        !Array.isArray(ids) ||
        ids.length > 50 ||
        !ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id))
      ) {
        throw createError({ statusCode: 400, message: "Invalid recipient list" });
      }
      const { error } = await supabase.rpc("acknowledge_sponsor_recipients", {
        p_participant: user.sub,
        p_edition: edition.slug,
        p_notice_version: PRIVACY_NOTICE_VERSION,
        p_recipient_ids: ids,
      });
      if (error?.message?.includes("sponsor_recipients_changed")) {
        throw createError({ statusCode: 409, message: "sponsor_recipients_changed" });
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
