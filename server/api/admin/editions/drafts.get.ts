import { requireAdmin } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data } = await supabase
    .from('editions')
    .select('slug, name, starts_at, ends_at')
    .eq('status', 'draft')
    .order('created_at')
  return data ?? []
})
