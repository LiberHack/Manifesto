import { describe, it, expect } from 'vitest'
import type { ArchiveMember, ArchiveTeam, EditionArchive, ArchiveIndex, RedactionEntry, Keyring } from '../../server/utils/archive-types'

describe('archive-types module loads', () => {
  it('can import the types module without error', async () => {
    const mod = await import('../../server/utils/archive-types')
    expect(mod).toBeDefined()
  })
})
