// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

describe('editions table constraints', () => {
  it('rejects a second is_current=true row (unique partial index)', async () => {
    await db.from('editions').insert({ slug: 'ci-test-1', name: 'CI 1', status: 'live', is_current: true })
    const { error } = await db.from('editions').insert({ slug: 'ci-test-2', name: 'CI 2', status: 'live', is_current: true })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505') // unique_violation
    await db.from('editions').delete().in('slug', ['ci-test-1', 'ci-test-2'])
  })

  it('rejects is_current=true with status != live (CHECK constraint)', async () => {
    const { error } = await db.from('editions').insert({ slug: 'ci-test-3', name: 'CI 3', status: 'draft', is_current: true })
    expect(error).not.toBeNull()
    await db.from('editions').delete().eq('slug', 'ci-test-3')
  })

  it('registrations unique (participant_id, edition_slug)', async () => {
    const tag = Date.now()
    const { data: auth } = await db.auth.admin.createUser({
      email: `reg-test-${tag}@ci.test`, password: 'test1234', email_confirm: true
    })
    const uid = auth.user!.id
    await db.from('editions').insert({ slug: `reg-ed-${tag}`, name: 'Reg Ed', status: 'live' })
    await db.from('registrations').insert({ participant_id: uid, edition_slug: `reg-ed-${tag}`, skills: [] })
    const { error } = await db.from('registrations').insert({ participant_id: uid, edition_slug: `reg-ed-${tag}`, skills: [] })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    await db.auth.admin.deleteUser(uid)
    await db.from('editions').delete().eq('slug', `reg-ed-${tag}`)
  })
})
