import { serverSupabaseUser } from "#supabase/server";

export default defineEventHandler(async (event) => {
  // Attach user to context so route handlers can read it without a second round-trip
  const user = await serverSupabaseUser(event).catch(() => null);
  event.context.user = user ?? null;
});
