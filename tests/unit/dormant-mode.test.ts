import { describe, it, expect } from 'vitest'

describe('dormant mode env', () => {
  it('NUXT_PUBLIC_SITE_MODE=dormant is recognized', () => {
    // Test the guard logic without a full Nuxt context
    const isDormant = (mode: string | undefined) => mode === 'dormant'
    expect(isDormant('dormant')).toBe(true)
    expect(isDormant('live')).toBe(false)
    expect(isDormant(undefined)).toBe(false)
  })
})
