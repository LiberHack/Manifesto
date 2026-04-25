import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=60");
  const supabase = useSupabaseAdmin()
  const { data } = await supabase.from('skills').select('name').order('name')
  return data ?? []
})
