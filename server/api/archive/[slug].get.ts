import { getEdition } from '../../utils/archive'

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')!
  const edition = getEdition(slug)
  if (!edition) throw createError({ statusCode: 404, message: 'Edition not found' })
  return edition
})
