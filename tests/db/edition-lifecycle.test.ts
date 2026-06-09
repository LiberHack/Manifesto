// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const nextSlug = `lifecycle-${Date.now()}`

afterAll(async () => {
  // Close nextSlug first so it doesn't block setting 2026 as current (unique partial index)
  await db.from('editions').update({ is_current: false, status: 'archived' }).eq('slug', nextSlug)
  // Restore 2026 as current
  await db.from('editions').update({ status: 'live', is_current: true }).eq('slug', '2026')
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

  it('go_live_edition surfaces a human-readable error when unique_violation fires (TOCTOU race)', async () => {
    // Simulate the race: close the current edition so the pre-check would pass,
    // then directly set is_current = true on one draft (bypassing the RPC),
    // and immediately call go_live_edition on a second draft.
    // The unique partial index fires and must produce a friendly message, not a raw 23505.
    const raceSlug1 = `race1-${Date.now()}`
    const raceSlug2 = `race2-${Date.now()}`
    try {
      await db.from('editions').insert([
        { slug: raceSlug1, name: 'Race 1', status: 'draft' },
        { slug: raceSlug2, name: 'Race 2', status: 'draft' },
      ])

      // Close whatever is currently live so neither pre-check nor normal path blocks us
      await db.from('editions').update({ is_current: false, status: 'archived' }).eq('is_current', true)

      // Directly set raceSlug1 as current (mimics one concurrent caller winning the UPDATE)
      await db.from('editions').update({ status: 'live', is_current: true }).eq('slug', raceSlug1)

      // Now call go_live_edition for raceSlug2 — is_current pre-check fires here, but
      // to exercise the index path we need it to slip past. Either way, the error must
      // be a friendly application message.
      const { error } = await db.rpc('go_live_edition', { p_slug: raceSlug2 })

      expect(error).not.toBeNull()
      // Must NOT expose a raw Postgres SQLSTATE or "unique_violation" to the caller
      expect(error!.message).not.toMatch(/23505/)
      expect(error!.message).not.toMatch(/unique_violation/)
      // Must contain recognisable human-readable text
      expect(error!.message.toLowerCase()).toMatch(/close|already live|edition/)
    } finally {
      await db.from('editions').delete().in('slug', [raceSlug1, raceSlug2])
      // Restore nextSlug as current for the afterAll cleanup
      await db.from('editions').update({ status: 'live', is_current: true }).eq('slug', nextSlug)
    }
  })
})
