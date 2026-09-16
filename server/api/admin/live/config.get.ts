import { requireAdmin, resolveAdminEdition } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)

  const { data, error } = await supabase
    .from('event_config')
    .select('*')
    .eq('edition_slug', edition.slug)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
