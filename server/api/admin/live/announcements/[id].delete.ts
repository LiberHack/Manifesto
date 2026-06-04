import { requireAdmin } from '#server/utils/adminAuth'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, message: error.message })
  await broadcastLive()
  return { success: true }
})
