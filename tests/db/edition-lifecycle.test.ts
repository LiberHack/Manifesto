// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const nextSlug = `lifecycle-${Date.now()}`

afterAll(async () => {
  // Restore 2026 as current if needed
  await db.from('editions').update({ status: 'live', is_current: true }).eq('slug', '2026').eq('is_current', false)
  await db.from('editions').delete().eq('slug', nextSlug)
})

describe('edition lifecycle', () => {
  it('close_edition archives current edition', async () => {
    await db.rpc('close_edition', { p_slug: '2026' })
    const { data } = await db.from('editions').select('status, is_current').eq('slug', '2026').single()
    expect(data!.status).toBe('archived')
    expect(data!.is_current).toBe(false)
  })

  it('ON DELETE RESTRICT blocks deleting an edition that has teams', async () => {
    const { data: teams } = await db.from('teams').select('id').eq('edition_slug', '2026').limit(1)
    if (!teams?.length) return
    const { error } = await db.from('editions').delete().eq('slug', '2026')
    expect(error).not.toBeNull()
  })

  it('close→draft→go_live leaves all prior data intact', async () => {
    await db.from('editions').insert({ slug: nextSlug, name: 'Next Edition', status: 'draft' })
    await db.rpc('go_live_edition', { p_slug: nextSlug })

    const { data: edition } = await db.from('editions').select('status, is_current').eq('slug', nextSlug).single()
    expect(edition!.status).toBe('live')
    expect(edition!.is_current).toBe(true)

    // Prior 2026 data is untouched
    const { count: teamCount } = await db.from('teams').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(teamCount).toBeGreaterThan(0)

    const { count: regCount } = await db.from('registrations').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(regCount).toBeGreaterThan(0)

    // New edition is empty
    const { count: newTeams } = await db.from('teams').select('*', { count: 'exact', head: true }).eq('edition_slug', nextSlug)
    expect(newTeams).toBe(0)
  })

  it('go_live_edition rejects if another edition is already current', async () => {
    // nextSlug is now current; try to go-live another draft
    const draftSlug = `double-${Date.now()}`
    await db.from('editions').insert({ slug: draftSlug, name: 'Double', status: 'draft' })
    const { error } = await db.rpc('go_live_edition', { p_slug: draftSlug })
    expect(error).not.toBeNull()
    await db.from('editions').delete().eq('slug', draftSlug)
  })
})
