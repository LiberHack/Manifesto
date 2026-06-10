import { requireAdmin } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const body = await readBody<{ slug: string; name: string; starts_at?: string; ends_at?: string }>(event)
  if (!body.slug?.trim() || !body.name?.trim()) throw createError({ statusCode: 400, message: 'slug and name required' })
  const { error } = await supabase.from('editions').insert({
    slug: body.slug.trim(),
    name: body.name.trim(),
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    status: 'draft',
  })
  if (error) throw createError({ statusCode: 400, message: error.message })
  return { ok: true }
})
