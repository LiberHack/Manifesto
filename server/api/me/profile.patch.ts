import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

const EXPERIENCE_VALUES = ['beginner', 'intermediate', 'experienced'] as const
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number]
const MAX_DIETARY_LENGTH = 200

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const body = await readBody<{ dietary?: unknown; experience?: unknown; public?: unknown }>(event)
  const update: Record<string, string | boolean | null> = {}

  if (body.dietary !== undefined) {
    if (body.dietary !== null && typeof body.dietary !== 'string')
      throw createError({ statusCode: 400, message: 'dietary must be a string' })
    const d = body.dietary === null ? '' : (body.dietary as string).trim()
    if (d.length > MAX_DIETARY_LENGTH)
      throw createError({ statusCode: 400, message: `Dietary must be ${MAX_DIETARY_LENGTH} chars or fewer` })
    update.dietary = d === '' ? null : d
  }

  if (body.experience !== undefined) {
    if (body.experience !== null && body.experience !== '' && !EXPERIENCE_VALUES.includes(body.experience as ExperienceLevel))
      throw createError({ statusCode: 400, message: `experience must be one of: ${EXPERIENCE_VALUES.join(', ')}` })
    update.experience = body.experience === null || body.experience === '' ? null : (body.experience as string)
  }

  if (body.public !== undefined) {
    if (typeof body.public !== 'boolean')
      throw createError({ statusCode: 400, message: 'public must be a boolean' })
    update.public = body.public
  }

  if (Object.keys(update).length === 0)
    throw createError({ statusCode: 400, message: 'No fields to update' })

  const supabase = useSupabaseAdmin()
  const { error } = await supabase
    .from('registrations')
    .update(update)
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)

  if (error) throw createError({ statusCode: 500, message: 'Internal server error' })
  return { ok: true }
})
