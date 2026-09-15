import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";
import { useSupabaseAdmin } from "#server/utils/supabase";
import {
  resolveRegistrationContext,
  type AuthedUser,
  type RegistrationContext,
} from "#server/utils/registrationContext";

/**
 * Resolve the caller's registration in the current edition.
 *
 * This is the real gate for every edition-scoped mutation — the client-side
 * redirect to /ops/register-edition is UX only.
 *
 * @throws 401 when unauthenticated, 403 `not_registered` when the account has
 *   no registration in the current edition, 503 when no edition is live.
 */
export async function requireRegistration(
  event: H3Event,
): Promise<RegistrationContext> {
  const user = (await serverSupabaseUser(event)) as AuthedUser | null;
  return resolveRegistrationContext(user, useSupabaseAdmin());
}
