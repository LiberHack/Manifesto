import { listEditions } from '../../utils/archive'

export default defineEventHandler(() => {
  return listEditions()
})
