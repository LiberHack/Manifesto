import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const supabase = useSupabaseAdmin()
  const { count } = await supabase
    .from('skills')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.sub)

  return { count: count ?? 0 }
})
