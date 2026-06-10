// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { serializeEdition } from '../../scripts/archive-export'
import { runRedactDelete } from '../../scripts/redact-delete'
import { applyRedactions } from '../../scripts/apply-redactions'
import { createClient } from '@supabase/supabase-js'
import type { EditionArchive, Keyring, RedactionEntry } from '../../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '../..')
const ARCHIVE = join(ROOT, 'archive')

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NUXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.NUXT_SUPABASE_SERVICE_KEY ?? ''

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ts = Date.now()
const ed1 = `wce-ed1-${ts}`
const ed2 = `wce-ed2-${ts}`
const ed3 = `wce-ed3-${ts}`
const slugs = [ed1, ed2, ed3]
const archiveFiles = slugs.map(s => join(ARCHIVE, `${s}.json`))

// Saved keyring/pending paths so afterAll can restore them
const keyringPath = join(ARCHIVE, 'redaction-keyring.json')
const pendingPath = join(ARCHIVE, 'redactions.pending.json')
const indexPath   = join(ARCHIVE, 'index.json')

// Snapshot index before the test so we can restore it
let savedIndex: string | null = null

afterAll(async () => {
  // Clean up test archive files
  for (const f of archiveFiles) { try { unlinkSync(f) } catch { /* ignore */ } }

  // Restore redactions.pending.json to empty
  writeFileSync(pendingPath, '[]')

  // Restore keyring to pre-test state (remove test entries)
  try {
    const keyring = JSON.parse(readFileSync(keyringPath, 'utf8')) as Keyring
    const cleaned = keyring.filter(k => !slugs.some(s => k.occurrences.some(o => o.edition_slug === s)))
    writeFileSync(keyringPath, JSON.stringify(cleaned, null, 2))
  } catch { /* ignore */ }

  // Restore index
  if (savedIndex) writeFileSync(indexPath, savedIndex)

  // Clean up DB test data
  for (const slug of slugs) {
    await db.from('registrations').delete().eq('edition_slug', slug)
    await db.from('teams').delete().eq('edition_slug', slug)
    await db.from('editions').delete().eq('slug', slug)
  }
}, 30_000)

describe('worst-case erasure: person in 3 editions, sole leader in one', () => {
  it('runs the full mid-dormancy deletion scenario', async () => {
    // Save current index so afterAll can restore it
    try { savedIndex = readFileSync(indexPath, 'utf8') } catch { /* ignore */ }

    // ── 1. Create test users ─────────────────────────────────────────────────
    const { data: aliceData } = await db.auth.admin.createUser({
      email: `alice-wce-${ts}@ci.test`,
      password: 'test1234',
      email_confirm: true,
    })
    const aliceId = aliceData.user!.id

    const { data: bobData } = await db.auth.admin.createUser({
      email: `bob-wce-${ts}@ci.test`,
      password: 'test1234',
      email_confirm: true,
    })
    const bobId = bobData.user!.id

    // ── 2. Create archived editions ──────────────────────────────────────────
    for (const slug of slugs) {
      const { error } = await db.from('editions').insert({ slug, name: slug, status: 'archived' })
      if (error) throw new Error(`Failed to insert edition ${slug}: ${error.message}`)
    }

    // ── 3. Create registrations for alice in all 3 editions (as leader) ──────
    const regIds: Record<string, string> = {}
    for (const slug of slugs) {
      const { data: r, error } = await db
        .from('registrations')
        .insert({ participant_id: aliceId, edition_slug: slug, role: 'leader', skills: [] })
        .select('id')
        .single()
      if (error) throw new Error(`Failed to insert alice registration for ${slug}: ${error.message}`)
      regIds[slug] = r!.id
    }

    // ── 4. Bob registered in ed1 only ────────────────────────────────────────
    const { data: bobReg, error: bobRegErr } = await db
      .from('registrations')
      .insert({ participant_id: bobId, edition_slug: ed1, skills: [] })
      .select('id')
      .single()
    if (bobRegErr) throw new Error(`Failed to insert bob registration: ${bobRegErr.message}`)

    // ── 5. Create teams and assign registrations ─────────────────────────────
    // ed1: team with alice + bob
    const { data: team1, error: t1Err } = await db
      .from('teams')
      .insert({ edition_slug: ed1, name: `SharedTeam-${ts}`, leader_id: regIds[ed1], skills_wanted: [] })
      .select('id')
      .single()
    if (t1Err) throw new Error(`Failed to create team in ed1: ${t1Err.message}`)

    await db.from('registrations').update({ team_id: team1!.id }).eq('id', regIds[ed1])
    await db.from('registrations').update({ team_id: team1!.id }).eq('id', bobReg!.id)

    // ed2: sole-leader team with only alice (no other members)
    const { data: team2, error: t2Err } = await db
      .from('teams')
      .insert({ edition_slug: ed2, name: `SoleTeam-${ts}`, leader_id: regIds[ed2], skills_wanted: [] })
      .select('id')
      .single()
    if (t2Err) throw new Error(`Failed to create team in ed2: ${t2Err.message}`)

    await db.from('registrations').update({ team_id: team2!.id }).eq('id', regIds[ed2])

    // ed3: team with alice only
    const { data: team3, error: t3Err } = await db
      .from('teams')
      .insert({ edition_slug: ed3, name: `AloneTeam-${ts}`, leader_id: regIds[ed3], skills_wanted: [] })
      .select('id')
      .single()
    if (t3Err) throw new Error(`Failed to create team in ed3: ${t3Err.message}`)

    await db.from('registrations').update({ team_id: team3!.id }).eq('id', regIds[ed3])

    // ── 6. Serialize all editions to archive files + build keyring ────────────
    // Read existing keyring (preserve existing entries)
    let keyring: Keyring = []
    try { keyring = JSON.parse(readFileSync(keyringPath, 'utf8')) } catch { /* first run */ }

    for (const slug of slugs) {
      const { data: ed, error: edErr } = await db
        .from('editions')
        .select(`
          slug, name, starts_at, ends_at,
          teams (
            id, name, description, github_url, placement, awards, presentation_order,
            registrations!team_id ( id, participant_id, public, skills, participants ( name ) )
          )
        `)
        .eq('slug', slug)
        .single()
      if (edErr) throw new Error(`Failed to fetch edition ${slug}: ${edErr.message}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { archive, keyringEntries } = serializeEdition(ed as any)
      writeFileSync(join(ARCHIVE, `${slug}.json`), JSON.stringify(archive, null, 2))

      for (const ke of keyringEntries) {
        let person = keyring.find(k => k.who === ke.participant_id)
        if (!person) {
          person = { who: ke.participant_id, email: '', occurrences: [] }
          keyring.push(person)
        }
        const existingIdx = person.occurrences.findIndex(o => o.edition_slug === ke.edition_slug)
        if (existingIdx >= 0) person.occurrences[existingIdx].token = ke.token
        else person.occurrences.push({ edition_slug: ke.edition_slug, token: ke.token })
      }
    }

    writeFileSync(keyringPath, JSON.stringify(keyring, null, 2))
    writeFileSync(pendingPath, '[]')

    // Verify alice is in the keyring with 3 occurrences
    const aliceKeyring = keyring.find(k => k.who === aliceId)
    expect(aliceKeyring).toBeDefined()
    const aliceOccs = aliceKeyring!.occurrences.filter(o => slugs.includes(o.edition_slug))
    expect(aliceOccs).toHaveLength(3)

    // ── 7. Run redact-delete for alice ────────────────────────────────────────
    runRedactDelete({ who: aliceId })

    // ── 8. Alice removed from all 3 archive files (opted_out NOT incremented) ─
    for (const occ of aliceOccs) {
      const arch = JSON.parse(
        readFileSync(join(ARCHIVE, `${occ.edition_slug}.json`), 'utf8'),
      ) as EditionArchive
      const allMembers = arch.teams.flatMap(t => t.members)
      expect(allMembers.some(m => m.token === occ.token)).toBe(false)
      expect(arch.opted_out).toBe(0)
    }

    // ── 9. Bob still present in ed1 ──────────────────────────────────────────
    const arch1 = JSON.parse(readFileSync(join(ARCHIVE, `${ed1}.json`), 'utf8')) as EditionArchive
    const bobKeyring = keyring.find(k => k.who === bobId)
    const bobOcc = bobKeyring?.occurrences.find(o => o.edition_slug === ed1)
    if (bobOcc) {
      expect(arch1.teams.flatMap(t => t.members).some(m => m.token === bobOcc.token)).toBe(true)
    }

    // ── 10. One delete entry queued ───────────────────────────────────────────
    const pending = JSON.parse(readFileSync(pendingPath, 'utf8')) as RedactionEntry[]
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'delete', who: aliceId })

    // ── 11. Apply redactions against DB ───────────────────────────────────────
    const applied: RedactionEntry[] = []
    await applyRedactions(db, pending, applied)
    expect(applied).toHaveLength(1)
    expect(pending).toHaveLength(0)

    // ── 12. Alice gone from DB ────────────────────────────────────────────────
    const { data: alicePart } = await db
      .from('participants')
      .select('id')
      .eq('id', aliceId)
      .maybeSingle()
    expect(alicePart).toBeNull()

    // ── 13. Sole-leader team in ed2 dissolved ─────────────────────────────────
    const { data: team2Check } = await db
      .from('teams')
      .select('id')
      .eq('id', team2!.id)
      .maybeSingle()
    expect(team2Check).toBeNull()

    // ── 14. Bob unaffected ────────────────────────────────────────────────────
    const { data: bobPart } = await db
      .from('participants')
      .select('id')
      .eq('id', bobId)
      .maybeSingle()
    expect(bobPart).not.toBeNull()

    // ── 15. Idempotent re-run: applying empty pending list is a no-op ─────────
    await applyRedactions(db, [], applied)
    expect(applied).toHaveLength(1)

    // Cleanup bob (alice already deleted via applyRedactions)
    await db.auth.admin.deleteUser(bobId)
  }, 60_000)
})
