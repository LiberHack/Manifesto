import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const { items } = await readBody<{ items: Array<{ id: string; sort_order: number }> }>(event)

  // Scoped by edition so a stale client cannot reorder another edition's rows.
  await Promise.all(
    items.map(({ id, sort_order }) =>
      supabase
        .from('announcements')
        .update({ sort_order })
        .eq('id', id)
        .eq('edition_slug', edition.slug),
    ),
  )

  return { success: true }
})
