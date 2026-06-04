import { requireAdmin } from '#server/utils/adminAuth'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { items } = await readBody<{ items: Array<{ id: string; sort_order: number }> }>(event)

  const updates = items.map(({ id, sort_order }) =>
    supabase.from('announcements').update({ sort_order }).eq('id', id)
  )

  await Promise.all(updates)
  await broadcastLive()
  return { success: true }
})
