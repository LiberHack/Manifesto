import { describe, it, expect, vi } from 'vitest'

vi.mock('#app', () => ({ useFetch: vi.fn() }))

describe('useArchive composable', () => {
  it('exports a useArchive function', async () => {
    const mod = await import('../../app/composables/useArchive')
    expect(typeof mod.useArchive).toBe('function')
  })

  it('useArchive returns listEditions and getEdition functions', async () => {
    const mod = await import('../../app/composables/useArchive')
    const { listEditions, getEdition } = mod.useArchive()
    expect(typeof listEditions).toBe('function')
    expect(typeof getEdition).toBe('function')
  })
})
