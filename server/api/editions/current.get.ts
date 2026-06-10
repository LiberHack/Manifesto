import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async () => {
  const supabase = useSupabaseAdmin()
  const { data } = await supabase
    .from('editions')
    .select('slug, name, starts_at, ends_at, status')
    .eq('is_current', true)
    .maybeSingle()
  return data ?? null
})
