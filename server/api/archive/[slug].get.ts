import { getEdition } from '../../utils/archive'

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw createError({ statusCode: 400, message: 'Invalid edition slug' })
  }
  const edition = getEdition(slug)
  if (!edition) throw createError({ statusCode: 404, message: 'Edition not found' })
  return edition
})
