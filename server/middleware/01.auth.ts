import { serverSupabaseUser } from "#supabase/server";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null);
  event.context.user = user ?? null;
});
