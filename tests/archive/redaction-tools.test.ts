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
