import { requireAdmin } from '#server/utils/adminAuth'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const body = await readBody(event)

  const { data: existing } = await supabase
    .from('schedule_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 1

  const { data, error } = await supabase
    .from('schedule_items')
    .insert({ ...body, sort_order })
    .select()
    .single()
  if (error) throw createError({ statusCode: 500, message: error.message })
  await broadcastLive()
  return data
})
