import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin } from '#server/utils/supabase'

const MAX_SKILLS_PER_USER = 5

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const body = await readBody<{ name: string }>(event)
  const name = body?.name?.trim()
  if (!name || name.length > 30) {
    throw createError({ statusCode: 400, message: 'Invalid skill name' })
  }

  const supabase = useSupabaseAdmin()

  // Check if skill already exists (case-insensitive) — no cap needed, just reuse
  const { data: existing } = await supabase
    .from('skills')
    .select('name')
    .ilike('name', name)
    .single()

  if (existing) return existing

  // New skill — enforce per-user creation cap
  const { count } = await supabase
    .from('skills')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)

  if ((count ?? 0) >= MAX_SKILLS_PER_USER) {
    throw createError({ statusCode: 422, message: `You can only add up to ${MAX_SKILLS_PER_USER} new skills` })
  }

  const { data: inserted } = await supabase
    .from('skills')
    .insert({ name, created_by: user.id })
    .select('name')
    .single()

  return inserted ?? { name }
})
