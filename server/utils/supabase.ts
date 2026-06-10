import { createClient } from "@supabase/supabase-js";

export function useSupabaseAdmin() {
  const config = useRuntimeConfig();
  return createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceKey as string
  );
}

export async function getCurrentEditionSlug(): Promise<string | null> {
  const supabase = useSupabaseAdmin()
  const { data } = await supabase
    .from('editions')
    .select('slug')
    .eq('is_current', true)
    .maybeSingle()
  return data?.slug ?? null
}
