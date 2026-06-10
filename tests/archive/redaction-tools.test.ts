import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '../..')
const ARCHIVE_DIR = join(ROOT, 'archive')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

describe('redact-hide', () => {
  const testSlug = 'redact-test'
  const testPath = join(ARCHIVE_DIR, `${testSlug}.json`)

  beforeEach(() => {
    writeJson(testPath, {
      slug: testSlug, name: 'Test', starts_at: null, ends_at: null,
      participant_count: 2, team_count: 1, opted_out: 0,
      teams: [{
        name: 'Team A', description: null, github_url: null, placement: null, awards: [], presentation_order: null,
        members: [
          { token: 'tok-alice', name: 'Alice', skills: [] },
          { token: 'tok-bob',   name: 'Bob',   skills: [] },
        ],
      }],
    })
    writeJson(join(ARCHIVE_DIR, 'index.json'), {
      editions: [{ slug: testSlug, name: 'Test', starts_at: null, ends_at: null, team_count: 1, participant_count: 2, opted_out: 0, winners: [] }]
    })
    writeJson(join(ARCHIVE_DIR, 'redactions.pending.json'), [])
  })

  it('removes the member by token and increments opted_out', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-alice', who: 'alice@test.com' })

    const archive = readJson<{ opted_out: number; teams: Array<{ members: Array<{ name: string }> }> }>(testPath)
    expect(archive.opted_out).toBe(1)
    expect(archive.teams[0].members).toHaveLength(1)
    expect(archive.teams[0].members[0].name).toBe('Bob')
  })

  it('updates opted_out in index.json', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-alice', who: 'alice@test.com' })

    const index = readJson<{ editions: Array<{ slug: string; opted_out: number }> }>(join(ARCHIVE_DIR, 'index.json'))
    const entry = index.editions.find(e => e.slug === testSlug)
    expect(entry!.opted_out).toBe(1)
  })

  it('queues a hide entry in redactions.pending.json', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-bob', who: 'bob@test.com' })

    const pending = readJson<Array<{ mode: string; edition_slug: string; token: string }>>(join(ARCHIVE_DIR, 'redactions.pending.json'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'hide', edition_slug: testSlug, token: 'tok-bob', who: 'bob@test.com' })
  })

  it('throws if token not found', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    expect(() => runRedactHide({ slug: testSlug, token: 'nonexistent', who: 'x@x.com' })).toThrow()
  })
})

describe('redact-delete', () => {
  const slugA = 'delete-test-a'
  const slugB = 'delete-test-b'

  function seedEdition(slug: string, tokens: string[]) {
    writeJson(join(ARCHIVE_DIR, `${slug}.json`), {
      slug, name: 'Del Test', starts_at: null, ends_at: null,
      participant_count: tokens.length, team_count: 1, opted_out: 0,
      teams: [{
        name: 'Team', description: null, github_url: null, placement: null, awards: [], presentation_order: null,
        members: tokens.map(t => ({ token: t, name: `User-${t}`, skills: [] })),
      }],
    })
  }

  function seedKeyring() {
    writeJson(join(ARCHIVE_DIR, 'redaction-keyring.json'), [
      {
        who: 'uid-alice', email: 'alice@test.com',
        occurrences: [
          { edition_slug: slugA, token: 'tok-a-alice' },
          { edition_slug: slugB, token: 'tok-b-alice' },
        ]
      },
      { who: 'uid-bob', email: 'bob@test.com', occurrences: [{ edition_slug: slugA, token: 'tok-a-bob' }] },
    ])
  }

  beforeEach(() => {
    seedEdition(slugA, ['tok-a-alice', 'tok-a-bob'])
    seedEdition(slugB, ['tok-b-alice'])
    seedKeyring()
    writeJson(join(ARCHIVE_DIR, 'redactions.pending.json'), [])
    writeJson(join(ARCHIVE_DIR, 'index.json'), { editions: [
      { slug: slugA, name: 'A', starts_at: null, ends_at: null, team_count: 1, participant_count: 2, opted_out: 0, winners: [] },
      { slug: slugB, name: 'B', starts_at: null, ends_at: null, team_count: 1, participant_count: 1, opted_out: 0, winners: [] },
    ]})
  })

  it('removes the person from ALL editions they appear in', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const archA = readJson<{ teams: Array<{ members: Array<{ name: string }> }> }>(join(ARCHIVE_DIR, `${slugA}.json`))
    const archB = readJson<{ teams: Array<{ members: Array<{ name: string }> }> }>(join(ARCHIVE_DIR, `${slugB}.json`))

    expect(archA.teams[0].members.some(m => m.name === 'User-tok-a-alice')).toBe(false)
    expect(archB.teams[0].members).toHaveLength(0)
  })

  it('does NOT increment opted_out (erasure is uncounted)', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const archA = readJson<{ opted_out: number }>(join(ARCHIVE_DIR, `${slugA}.json`))
    const archB = readJson<{ opted_out: number }>(join(ARCHIVE_DIR, `${slugB}.json`))
    expect(archA.opted_out).toBe(0)
    expect(archB.opted_out).toBe(0)
  })

  it('queues a single account-scoped delete entry', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const pending = readJson<Array<{ mode: string; who: string }>>(join(ARCHIVE_DIR, 'redactions.pending.json'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'delete', who: 'alice@test.com' })
  })

  it('throws if who not found in keyring', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    expect(() => runRedactDelete({ who: 'nobody@test.com' })).toThrow(/keyring/i)
  })
})

describe('apply-redactions idempotency', () => {
  it('processes hide entries: sets registrations.public=false', async () => {
    const mockDb = {
      from: (_table: string) => ({
        update: (_data: unknown) => ({
          eq: () => ({ eq: () => ({ eq: () => ({ error: null, data: null }) }) }),
        }),
        delete: () => ({
          eq: () => ({ error: null }),
        }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
      auth: {
        admin: {
          deleteUser: async (_id: string) => ({ error: null })
        }
      }
    }
    const { applyRedactions } = await import('../../scripts/apply-redactions')
    const pending: import('../../server/utils/archive-types').RedactionEntry[] = [{ mode: 'hide', edition_slug: '2026', token: 'tok-x', who: 'alice@test.com' }]
    const applied: import('../../server/utils/archive-types').RedactionEntry[] = []
    await applyRedactions(mockDb as never, pending, applied)
    expect(applied).toHaveLength(1)
    expect(pending).toHaveLength(0)
  })

  it('is idempotent: re-running with same entries does not fail', async () => {
    const mockDb = {
      from: () => ({
        update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }) }),
        delete: () => ({ eq: () => ({ error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
      auth: {
        admin: {
          deleteUser: async (_id: string) => ({ error: null })
        }
      }
    }
    const { applyRedactions } = await import('../../scripts/apply-redactions')
    const pending: import('../../server/utils/archive-types').RedactionEntry[] = [{ mode: 'delete', who: 'alice@test.com' }]
    const applied: import('../../server/utils/archive-types').RedactionEntry[] = []
    await applyRedactions(mockDb as never, pending, applied)
    await applyRedactions(mockDb as never, [], applied)
    expect(applied).toHaveLength(1)
  })
})
