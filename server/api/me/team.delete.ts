import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const supabase = useSupabaseAdmin()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, team_id, role')
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)
    .maybeSingle()

  if (!reg?.team_id) throw createError({ statusCode: 409, message: 'Not in a team' })
  if (reg.role === 'leader') throw createError({ statusCode: 409, message: 'Leader cannot leave — transfer leadership first' })

  const { error } = await supabase
    .from('registrations')
    .update({ team_id: null, role: 'participant' })
    .eq('id', reg.id)

  if (error) throw createError({ statusCode: 500, message: 'Internal server error' })
  return { ok: true }
})
