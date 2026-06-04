import { requireAdmin } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data, error } = await supabase.from('schedule_items').select('*').order('sort_order')
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
