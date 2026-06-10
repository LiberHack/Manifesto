import type { ArchiveIndex, EditionArchive } from '../../server/utils/archive-types'

export function useArchive() {
  function listEditions() {
    return useFetch<ArchiveIndex>('/api/archive')
  }

  function getEdition(slug: string) {
    return useFetch<EditionArchive>(`/api/archive/${slug}`)
  }

  return { listEditions, getEdition }
}
