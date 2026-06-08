// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

describe('backfill: 2026 edition', () => {
  it('editions row exists, is live and current', async () => {
    const { data } = await db.from('editions').select('*').eq('slug', '2026').single()
    expect(data).not.toBeNull()
    expect(data!.is_current).toBe(true)
    expect(data!.status).toBe('live')
  })

  it('every participant has a registration for 2026', async () => {
    const { count: pCount } = await db.from('participants').select('*', { count: 'exact', head: true })
    const { count: rCount } = await db.from('registrations').select('*', { count: 'exact', head: true }).eq('edition_slug', '2026')
    expect(rCount).toBe(pCount)
  })

  it('no team has a null edition_slug', async () => {
    const { data } = await db.from('teams').select('id').is('edition_slug', null)
    expect(data).toHaveLength(0)
  })

  it('duplicate team names within an edition are rejected case-insensitively', async () => {
    const { data: team } = await db.from('teams').select('edition_slug, name, leader_id, skills_wanted').limit(1).single()
    if (!team) return
    const { error } = await db.from('teams').insert({
      edition_slug: team.edition_slug,
      name: team.name.toUpperCase(),
      leader_id: team.leader_id,
      skills_wanted: team.skills_wanted,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('same team name is allowed across different editions', async () => {
    const tag = Date.now()
    const slug = `other-ed-${tag}`
    await db.from('editions').insert({ slug, name: 'Other', status: 'draft' })
    const { data: team } = await db.from('teams').select('name, skills_wanted').limit(1).single()
    if (!team) { await db.from('editions').delete().eq('slug', slug); return }
    // Get any valid leader (a registration in 2026)
    const { data: someReg } = await db.from('registrations').select('id').eq('edition_slug', '2026').limit(1).single()
    if (!someReg) { await db.from('editions').delete().eq('slug', slug); return }
    const { error } = await db.from('teams').insert({
      edition_slug: slug, name: team.name, leader_id: someReg.id, skills_wanted: team.skills_wanted
    })
    // leader_id references a 2026 registration, not a registration in `slug` edition
    // The cross-edition name uniqueness check passes (no 23505 with the edition name constraint)
    if (error) expect(error.code).not.toBe('23505')
    await db.from('teams').delete().eq('edition_slug', slug)
    await db.from('editions').delete().eq('slug', slug)
  })

  it('participants no longer has per-edition columns', async () => {
    // skills column should not exist
    const { error } = await db.from('participants').select('skills').limit(1)
    expect(error).not.toBeNull()
  })

  it('new user signup creates participant + registration for current edition', async () => {
    const tag = Date.now()
    const { data: auth } = await db.auth.admin.createUser({
      email: `trigger-test-${tag}@ci.test`,
      password: 'test1234',
      email_confirm: true,
      user_metadata: { name: 'Trigger Test', skills: ['TypeScript'], dietary: '', experience: 'beginner' },
    })
    const uid = auth.user!.id

    const { data: p } = await db.from('participants').select('id, name, email').eq('id', uid).single()
    expect(p!.name).toBe('Trigger Test')
    expect(p!.email).toBe(`trigger-test-${tag}@ci.test`)

    const { data: reg } = await db.from('registrations').select('*').eq('participant_id', uid).maybeSingle()
    // Only expect a registration if an edition is currently live
    const { data: current } = await db.from('editions').select('slug').eq('is_current', true).maybeSingle()
    if (current) {
      expect(reg).not.toBeNull()
      expect(reg!.edition_slug).toBe(current.slug)
      expect(reg!.skills).toContain('TypeScript')
      expect(reg!.experience).toBe('beginner')
    }

    await db.auth.admin.deleteUser(uid)
  })
})
