import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const { edition_slug: _ignored, sort_order: _order, ...body } =
    await readBody<Record<string, unknown>>(event)

  const { data: existing } = await supabase
    .from('schedule_items')
    .select('sort_order')
    .eq('edition_slug', edition.slug)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = existing ? (existing.sort_order as number) + 1 : 1

  const { data, error } = await supabase
    .from('schedule_items')
    .insert({ ...body, edition_slug: edition.slug, sort_order })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
})
