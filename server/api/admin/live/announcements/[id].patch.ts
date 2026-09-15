import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'
import { readAnnouncementBody } from '#server/utils/announcementInput'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const id = getRouterParam(event, 'id')
  const update = readAnnouncementBody(await readBody(event), { requireBody: false })

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const { data, error } = await supabase
    .from('announcements')
    .update(update)
    .eq('id', id)
    .eq('edition_slug', edition.slug)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
