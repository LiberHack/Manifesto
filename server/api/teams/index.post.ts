import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

const MAX_SKILLS = 10
const MAX_SKILL_LENGTH = 30

function validateSkills(skillsWanted: unknown): string[] {
  if (!skillsWanted) return []
  if (!Array.isArray(skillsWanted)) throw createError({ statusCode: 400, message: 'skills_wanted must be an array' })
  const skills = (skillsWanted as unknown[]).map(s => String(s).trim()).filter(s => s.length > 0)
  if (skills.length > MAX_SKILLS) throw createError({ statusCode: 400, message: `Maximum ${MAX_SKILLS} skills allowed` })
  const bad = skills.find(s => s.length > MAX_SKILL_LENGTH)
  if (bad) throw createError({ statusCode: 400, message: `Skill "${bad}" exceeds ${MAX_SKILL_LENGTH} characters` })
  return skills
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const supabase = useSupabaseAdmin()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, team_id')
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)
    .maybeSingle()

  if (!reg) throw createError({ statusCode: 409, message: 'Not registered for this edition' })
  if (reg.team_id) throw createError({ statusCode: 409, message: 'Already in a team' })

  const body = await readBody<{ name: string; skills_wanted?: string[]; description?: string }>(event)
  if (!body.name?.trim()) throw createError({ statusCode: 400, message: 'Team name is required' })
  const skills = validateSkills(body.skills_wanted)

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert({
      edition_slug: editionSlug,
      name: body.name.trim(),
      leader_id: reg.id,
      skills_wanted: skills,
      description: body.description ?? null,
    })
    .select()
    .single()

  if (teamErr) {
    if (teamErr.code === '23505') throw createError({ statusCode: 409, message: 'Team name already taken in this edition' })
    throw createError({ statusCode: 500, message: 'Failed to create team' })
  }

  await supabase
    .from('registrations')
    .update({ team_id: team.id, role: 'leader' })
    .eq('id', reg.id)

  return team
})
