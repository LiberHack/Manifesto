import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Refuse callers whose email address has not been confirmed.
 *
 * The JWT only carries `user_metadata.email_verified`, which the client
 * middleware checks for UX; the authoritative `email_confirmed_at` lives on
 * `auth.users`, so it is read here with the admin client. Checked when a
 * registration is created: every edition-scoped route requires one, so this
 * gates them all without an extra auth lookup per request.
 *
 * @throws 403 `email_unverified` when the address is unconfirmed,
 *   503 when the auth lookup fails (fails closed).
 */
export async function requireConfirmedEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data.user) {
    console.error("[requireConfirmedEmail] lookup failed:", error?.message);
    throw createError({ statusCode: 503, message: "auth_unavailable" });
  }

  if (!data.user.email_confirmed_at) {
    throw createError({ statusCode: 403, message: "email_unverified" });
  }
}
