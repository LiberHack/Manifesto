import { requireAdmin } from '#server/utils/adminAuth'
import { getCurrentEditionSlug } from '#server/utils/supabase'
import { broadcastLive } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })
  const body = await readBody(event)
  const { data, error } = await supabase
    .from('event_config')
    .update(body)
    .eq('edition_slug', editionSlug)
    .select()
    .single()
  if (error) throw createError({ statusCode: 500, message: error.message })
  await broadcastLive()
  return data
})
