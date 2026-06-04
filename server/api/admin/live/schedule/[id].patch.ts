import { requireAdmin } from '#server/utils/adminAuth'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const { data, error } = await supabase
    .from('schedule_items')
    .update(body)
    .eq('id', id)
    .select()
    .single()
  if (error) throw createError({ statusCode: 500, message: error.message })
  await broadcastLive()
  return data
})
