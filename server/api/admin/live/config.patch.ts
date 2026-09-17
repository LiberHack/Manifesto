import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'

const EDITABLE = ['event_name', 'event_start', 'event_end', 'github_urls_public'] as const

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const body = await readBody<Record<string, unknown>>(event)

  // edition_slug is the primary key here; it is never client-writable.
  const update = Object.fromEntries(
    EDITABLE.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]),
  )

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const { data, error } = await supabase
    .from('event_config')
    .upsert({ edition_slug: edition.slug, ...update }, { onConflict: 'edition_slug' })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
