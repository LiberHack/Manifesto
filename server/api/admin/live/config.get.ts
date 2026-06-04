import { requireAdmin } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data, error } = await supabase.from('event_config').select('*').eq('id', 1).single()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
