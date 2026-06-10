import { requireAdmin } from '#server/utils/adminAuth'
import { getCurrentEditionSlug } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) return null
  const { data, error } = await supabase
    .from('event_config')
    .select('*')
    .eq('edition_slug', editionSlug)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
