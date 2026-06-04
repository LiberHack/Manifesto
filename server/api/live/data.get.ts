import { fetchLiveData } from '#server/utils/liveStream'

export default defineEventHandler(async () => {
  return fetchLiveData()
})
