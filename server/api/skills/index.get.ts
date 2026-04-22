import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async () => {
  const supabase = useSupabaseAdmin()
  const { data } = await supabase.from('skills').select('name').order('name')
  return data ?? []
})
