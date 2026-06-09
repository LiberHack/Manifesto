// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function makeUser(email: string) {
  const { data } = await db.auth.admin.createUser({ email, password: 'test1234', email_confirm: true })
  return data.user!.id
}

describe('handle_leader_departure trigger', () => {
  it('promotes earliest-registered member when leader is deleted', async () => {
    const tag = Date.now()
    const edSlug = `dep-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Dep Test', status: 'live' })

    const leaderId = await makeUser(`leader-${tag}@ci.test`)
    const memberId = await makeUser(`member-${tag}@ci.test`)

    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()

    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `Team${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()

    const { data: memberReg } = await db.from('registrations')
      .insert({ participant_id: memberId, edition_slug: edSlug, team_id: team!.id, skills: [] })
      .select().single()

    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    // Delete the leader registration
    await db.from('registrations').delete().eq('id', leaderReg!.id)

    const { data: updatedTeam } = await db.from('teams').select('leader_id').eq('id', team!.id).single()
    expect(updatedTeam!.leader_id).toBe(memberReg!.id)

    const { data: updatedMember } = await db.from('registrations').select('role').eq('id', memberReg!.id).single()
    expect(updatedMember!.role).toBe('leader')

    await db.auth.admin.deleteUser(leaderId)
    await db.auth.admin.deleteUser(memberId)
    await db.from('editions').delete().eq('slug', edSlug)
  })

  it('dissolves team when sole leader has no other members', async () => {
    const tag = Date.now()
    const edSlug = `sole-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Sole Test', status: 'live' })

    const leaderId = await makeUser(`sole-${tag}@ci.test`)
    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()

    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `SoleTeam${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()

    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    await db.from('registrations').delete().eq('id', leaderReg!.id)

    const { data: dissolved } = await db.from('teams').select('id').eq('id', team!.id).maybeSingle()
    expect(dissolved).toBeNull()

    await db.auth.admin.deleteUser(leaderId)
    await db.from('editions').delete().eq('slug', edSlug)
  })

  it('rejects team insert where leader_id belongs to a different edition', async () => {
    const tag = Date.now()
    const edA = `integ-a-${tag}`
    const edB = `integ-b-${tag}`
    await db.from('editions').insert([
      { slug: edA, name: 'Integrity A', status: 'live' },
      { slug: edB, name: 'Integrity B', status: 'live' },
    ])

    const userId = await makeUser(`integ-${tag}@ci.test`)

    // Register user in edition A only
    const { data: regA } = await db.from('registrations')
      .insert({ participant_id: userId, edition_slug: edA, skills: [] })
      .select().single()

    // Attempt to create a team in edition B using the edition A registration as leader
    const { error } = await db.from('teams').insert({
      edition_slug: edB,
      name: `IntegTeam${tag}`,
      leader_id: regA!.id,
      skills_wanted: [],
    })

    expect(error).not.toBeNull()
    // Trigger raises P0001; Supabase wraps it as code '42501' or passes through — check message
    expect(error!.message).toMatch(/leader_id must belong to the same edition/i)

    await db.auth.admin.deleteUser(userId)
    await db.from('editions').delete().eq('slug', edA)
    await db.from('editions').delete().eq('slug', edB)
  })

  it('deletion via auth.users cascade also triggers handle_leader_departure', async () => {
    const tag = Date.now()
    const edSlug = `cascade-${tag}`
    await db.from('editions').insert({ slug: edSlug, name: 'Cascade Test', status: 'live' })

    const leaderId = await makeUser(`cas-lead-${tag}@ci.test`)
    const memberId = await makeUser(`cas-mem-${tag}@ci.test`)

    const { data: leaderReg } = await db.from('registrations')
      .insert({ participant_id: leaderId, edition_slug: edSlug, role: 'leader', skills: [] })
      .select().single()
    const { data: team } = await db.from('teams')
      .insert({ edition_slug: edSlug, name: `CasTeam${tag}`, leader_id: leaderReg!.id, skills_wanted: [] })
      .select().single()
    const { data: memberReg } = await db.from('registrations')
      .insert({ participant_id: memberId, edition_slug: edSlug, team_id: team!.id, skills: [] })
      .select().single()
    await db.from('registrations').update({ team_id: team!.id }).eq('id', leaderReg!.id)

    // Delete auth user (cascades: auth.users → participants → registrations → trigger fires)
    await db.auth.admin.deleteUser(leaderId)

    const { data: promoted } = await db.from('registrations').select('role').eq('id', memberReg!.id).single()
    expect(promoted!.role).toBe('leader')

    await db.auth.admin.deleteUser(memberId)
    await db.from('editions').delete().eq('slug', edSlug)
  })
})
