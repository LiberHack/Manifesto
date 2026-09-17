import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const id = getRouterParam(event, 'id')

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('edition_slug', edition.slug)

  if (error) throw createError({ statusCode: 500, message: error.message })
  return { success: true }
})
