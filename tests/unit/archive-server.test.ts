// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string, _enc: string) => {
    if (path.includes('index.json')) return '{"editions":[{"slug":"2026","name":"LiberHack 2026","starts_at":null,"ends_at":null,"team_count":5,"participant_count":20,"winners":[]}]}'
    if (path.includes('2026.json')) return '{"slug":"2026","name":"LiberHack 2026","starts_at":null,"ends_at":null,"team_count":5,"participant_count":20,"opted_out":0,"teams":[]}'
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }),
}))

describe('server/utils/archive', () => {
  it('listEditions returns parsed index', async () => {
    const { listEditions } = await import('../../server/utils/archive')
    const result = listEditions()
    expect(result.editions[0].slug).toBe('2026')
  })

  it('getEdition returns the edition', async () => {
    const { getEdition } = await import('../../server/utils/archive')
    const result = getEdition('2026')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('2026')
  })

  it('getEdition returns null for unknown slug', async () => {
    const { getEdition } = await import('../../server/utils/archive')
    const result = getEdition('unknown-slug')
    expect(result).toBeNull()
  })
})
