import { requireAdmin } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { slug } = await readBody<{ slug: string }>(event)
  if (!slug) throw createError({ statusCode: 400, message: 'slug required' })
  const { error } = await supabase.rpc('go_live_edition', { p_slug: slug })
  if (error) throw createError({ statusCode: 400, message: error.message })
  return { ok: true }
})
