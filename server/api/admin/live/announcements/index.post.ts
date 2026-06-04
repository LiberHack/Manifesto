import { requireAdmin } from '#server/utils/adminAuth'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const body = await readBody(event)
  const { data, error } = await supabase.from('announcements').insert(body).select().single()
  if (error) throw createError({ statusCode: 500, message: error.message })
  await broadcastLive()
  return data
})
