import type { H3Event } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import {
  getCurrentEdition,
  type Edition,
} from "#server/utils/registrationContext";

export async function requireAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event);
  if (!user) throw createError({ statusCode: 401, message: "Unauthorized" });

  const supabase = useSupabaseAdmin();
  const { data: participant } = await supabase
    .from("participants")
    .select("role")
    .eq("id", user.sub)
    .single();

  if (participant?.role !== "admin") {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  return { user, supabase };
}

/**
 * The edition an admin view is scoped to: `?edition=<slug>` when given,
 * otherwise the current one. Archived editions are readable but read-only,
 * which each write route asserts via {@link assertEditionWritable}.
 */
export async function resolveAdminEdition(
  event: H3Event,
  supabase: SupabaseClient,
): Promise<Edition> {
  const { edition: slug } = getQuery(event) as { edition?: string };

  if (slug) {
    const { data } = await supabase
      .from("editions")
      .select("slug, name, starts_at, ends_at, status, participant_cap, ops_enabled")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) throw createError({ statusCode: 404, message: "Edition not found" });
    return data as Edition;
  }

  const current = await getCurrentEdition(supabase);
  if (!current) throw createError({ statusCode: 503, message: "no_live_edition" });
  return current;
}

export function assertEditionWritable(edition: Edition): void {
  if (edition.status === "archived") {
    throw createError({
      statusCode: 409,
      message: "edition_archived",
    });
  }
}
