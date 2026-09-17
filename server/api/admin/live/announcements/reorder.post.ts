import {
  requireAdmin,
  resolveAdminEdition,
  assertEditionWritable,
} from '#server/utils/adminAuth'

const CHANNELS = ['live', 'ops', 'site'] as const
type Channel = (typeof CHANNELS)[number]

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const edition = await resolveAdminEdition(event, supabase)
  assertEditionWritable(edition)

  const { items, channel } = await readBody<{
    items: Array<{ id: string; sort_order: number }>
    channel?: Channel
  }>(event)

  if (channel !== undefined && !CHANNELS.includes(channel)) {
    throw createError({ statusCode: 400, message: 'Unknown channel' })
  }

  // Scoped by edition and channel so a stale client cannot renumber rows
  // belonging to another edition or another banner group.
  await Promise.all(
    items.map(({ id, sort_order }) => {
      let query = supabase
        .from('announcements')
        .update({ sort_order })
        .eq('id', id)
        .eq('edition_slug', edition.slug)
      if (channel) query = query.eq('channel', channel)
      return query
    }),
  )

  return { success: true }
})
