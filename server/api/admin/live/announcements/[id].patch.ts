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
  const { edition_slug: _ignored, ...body } = await readBody<Record<string, unknown>>(event)

  const { data, error } = await supabase
    .from('announcements')
    .update(body)
    .eq('id', id)
    .eq('edition_slug', edition.slug)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
