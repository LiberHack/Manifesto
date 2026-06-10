import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const supabase = useSupabaseAdmin()
  const editionSlug = await getCurrentEditionSlug()

  const { data: participant } = await supabase
    .from('participants')
    .select('id, name, email')
    .eq('id', user.sub)
    .single()

  if (!participant) throw createError({ statusCode: 404, message: 'Participant not found' })

  let registration = null
  if (editionSlug) {
    const { data } = await supabase
      .from('registrations')
      .select('id, role, team_id, skills, dietary, experience, public, edition_slug, team:teams(id, name, skills_wanted, description, leader_id, invite_code, github_url)')
      .eq('participant_id', user.sub)
      .eq('edition_slug', editionSlug)
      .maybeSingle()
    registration = data
  }

  return { ...participant, registration }
})
