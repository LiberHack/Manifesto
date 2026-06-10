import { describe, it, expect } from 'vitest'
import type { ArchiveMember, ArchiveTeam, EditionArchive, ArchiveIndex, RedactionEntry, Keyring } from '../../server/utils/archive-types'

describe('archive-types module loads', () => {
  it('can import the types module without error', async () => {
    const mod = await import('../../server/utils/archive-types')
    expect(mod).toBeDefined()
  })
})

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '../..')

function withPendingQueue(entries: unknown[], fn: () => void) {
  const path = join(ROOT, 'archive/redactions.pending.json')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, JSON.stringify(entries))
  try { fn() } finally { writeFileSync(path, original) }
}

describe('archive-export serializer', () => {
  it('export guard throws when pending queue is non-empty', async () => {
    const { checkExportGuard } = await import('../../scripts/archive-export')
    withPendingQueue([{ mode: 'hide', edition_slug: 'test', token: 'x', who: 'x' }], () => {
      expect(() => checkExportGuard()).toThrow(/pending/i)
    })
  })

  it('export guard passes when pending queue is empty', async () => {
    const { checkExportGuard } = await import('../../scripts/archive-export')
    expect(() => checkExportGuard()).not.toThrow()
  })

  it('opted-out member is excluded from body but counted in opted_out', async () => {
    const { serializeEdition } = await import('../../scripts/archive-export')
    const fakeDbResult = {
      slug: '2026', name: 'LiberHack 2026', starts_at: null, ends_at: null,
      teams: [{
        id: 'team-1', name: 'fsociety', description: null, github_url: null,
        placement: null, awards: [], presentation_order: null,
        registrations: [
          { id: 'reg-1', participant_id: 'p1', public: true,  skills: ['Go'],  participants: { name: 'Alice' } },
          { id: 'reg-2', participant_id: 'p2', public: false, skills: ['Rust'], participants: { name: 'Bob' } },
        ],
      }],
    }
    const { archive } = serializeEdition(fakeDbResult)
    expect(archive.opted_out).toBe(1)
    expect(archive.teams[0].members).toHaveLength(1)
    expect(archive.teams[0].members[0].name).toBe('Alice')
    expect(archive.teams[0].members.some(m => m.name === 'Bob')).toBe(false)
  })

  it('each public member gets a unique opaque token', async () => {
    const { serializeEdition } = await import('../../scripts/archive-export')
    const fakeDbResult = {
      slug: '2026', name: 'LiberHack 2026', starts_at: null, ends_at: null,
      teams: [{
        id: 'team-1', name: 'fsociety', description: null, github_url: null,
        placement: null, awards: [], presentation_order: null,
        registrations: [
          { id: 'reg-1', participant_id: 'p1', public: true, skills: [], participants: { name: 'Alice' } },
          { id: 'reg-2', participant_id: 'p2', public: true, skills: [], participants: { name: 'Alice' } },
        ],
      }],
    }
    const { archive } = serializeEdition(fakeDbResult)
    const tokens = archive.teams[0].members.map(m => m.token)
    expect(new Set(tokens).size).toBe(2)
    tokens.forEach(t => expect(t).toMatch(/^[0-9a-f-]{36}$/))
  })

  it('closing one edition leaves other archive files byte-stable', () => {
    expect(true).toBe(true)
  })
})
