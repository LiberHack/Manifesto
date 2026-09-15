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

  const body = readAnnouncementBody(await readBody(event), { requireBody: true })
  const channel = body.channel ?? 'live'

  // sort_order is per channel, so the next slot is computed within the chosen
  // channel rather than across the whole table.
  const { data: existing } = await supabase
    .from('announcements')
    .select('sort_order')
    .eq('edition_slug', edition.slug)
    .eq('channel', channel)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = existing ? (existing.sort_order as number) + 1 : 1

  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...body, channel, edition_slug: edition.slug, sort_order })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
