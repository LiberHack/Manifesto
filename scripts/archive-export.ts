import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import type { EditionArchive, ArchiveIndex, ArchiveIndexEntry, KeyringEntry, Keyring } from '../server/utils/archive-types'
import type { ArchiveTeam, ArchiveMember } from '../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '..')
const PENDING_PATH = join(ROOT, 'archive/redactions.pending.json')
const APPLIED_PATH = join(ROOT, 'archive/redactions.applied.json')
const INDEX_PATH   = join(ROOT, 'archive/index.json')
const KEYRING_PATH = join(ROOT, 'archive/redaction-keyring.json')

export function checkExportGuard(): void {
  const pending = JSON.parse(readFileSync(PENDING_PATH, 'utf8')) as unknown[]
  if (pending.length > 0) {
    throw new Error(
      `Export blocked: ${pending.length} pending redaction(s) in archive/redactions.pending.json. ` +
      `Run apply-redactions first.`
    )
  }
}

interface DbRegistration {
  id: string
  participant_id: string
  public: boolean
  skills: string[]
  participants: { name: string }
}

interface DbTeam {
  id: string
  name: string
  description: string | null
  github_url: string | null
  placement: number | null
  awards: string[]
  presentation_order: number | null
  registrations: DbRegistration[]
}

interface DbEdition {
  slug: string
  name: string
  starts_at: string | null
  ends_at: string | null
  teams: DbTeam[]
}

interface SerializeResult {
  archive: EditionArchive
  keyringEntries: Array<{ participant_id: string; edition_slug: string; token: string }>
}

export function serializeEdition(dbEdition: DbEdition): SerializeResult {
  const keyringEntries: SerializeResult['keyringEntries'] = []
  let opted_out = 0
  let participant_count = 0

  const teams: ArchiveTeam[] = dbEdition.teams.map(team => {
    const members: ArchiveMember[] = []

    for (const reg of team.registrations) {
      participant_count++
      if (!reg.public) {
        opted_out++
        continue
      }
      const token = crypto.randomUUID()
      keyringEntries.push({ participant_id: reg.participant_id, edition_slug: dbEdition.slug, token })
      members.push({ token, name: reg.participants.name, skills: reg.skills })
    }

    return {
      name: team.name,
      description: team.description,
      github_url: team.github_url,
      placement: team.placement,
      awards: team.awards,
      presentation_order: team.presentation_order,
      members,
    }
  })

  const archive: EditionArchive = {
    slug: dbEdition.slug,
    name: dbEdition.name,
    starts_at: dbEdition.starts_at,
    ends_at: dbEdition.ends_at,
    participant_count,
    team_count: dbEdition.teams.length,
    opted_out,
    teams,
  }

  return { archive, keyringEntries }
}

function buildIndexEntry(archive: EditionArchive): ArchiveIndexEntry {
  const winners = archive.teams
    .filter(t => t.placement !== null)
    .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
    .map(t => ({ team_name: t.name, placement: t.placement!, awards: t.awards }))

  return {
    slug: archive.slug,
    name: archive.name,
    starts_at: archive.starts_at,
    ends_at: archive.ends_at,
    team_count: archive.team_count,
    participant_count: archive.participant_count,
    opted_out: archive.opted_out,
    winners,
  }
}

async function main() {
  checkExportGuard()

  const args = process.argv.slice(2)
  const slugIdx = args.indexOf('--slug')
  const targetSlug = slugIdx !== -1 ? args[slugIdx + 1] : null

  const db = createClient(
    process.env.SUPABASE_URL ?? process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NUXT_SUPABASE_SERVICE_KEY ?? ''
  )

  let query = db
    .from('editions')
    .select(`
      slug, name, starts_at, ends_at,
      teams (
        id, name, description, github_url, placement, awards, presentation_order,
        registrations ( id, participant_id, public, skills, participants ( name ) )
      )
    `)
    .eq('status', 'archived')

  if (targetSlug) query = query.eq('slug', targetSlug)

  const { data: editions, error } = await query
  if (error) throw new Error(`DB query failed: ${error.message}`)
  if (!editions?.length) { console.log('No archived editions found.'); return }

  const allKeyringEntries: SerializeResult['keyringEntries'] = []

  for (const ed of editions) {
    const { archive, keyringEntries } = serializeEdition(ed as unknown as DbEdition)
    writeFileSync(join(ROOT, `archive/${archive.slug}.json`), JSON.stringify(archive, null, 2))
    console.log(`Wrote archive/${archive.slug}.json`)
    allKeyringEntries.push(...keyringEntries)
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as ArchiveIndex
  for (const ed of editions) {
    const { archive } = serializeEdition(ed as unknown as DbEdition)
    const entry = buildIndexEntry(archive)
    const existing = index.editions.findIndex(e => e.slug === entry.slug)
    if (existing >= 0) index.editions[existing] = entry
    else index.editions.push(entry)
  }
  index.editions.sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2))
  console.log('Updated archive/index.json')

  let keyring: Keyring = []
  try { keyring = JSON.parse(readFileSync(KEYRING_PATH, 'utf8')) } catch { /* first run */ }

  const exportedSlugs = editions.map(e => e.slug)
  const { data: regData } = await db
    .from('registrations')
    .select('participant_id, participants(id, email)')
    .in('edition_slug', exportedSlugs)

  const emailByPid = new Map<string, string>()
  for (const r of regData ?? []) {
    const p = r.participants as { id: string; email: string } | null
    if (p) emailByPid.set(r.participant_id, p.email)
  }

  for (const entry of allKeyringEntries) {
    let person = keyring.find(k => k.who === entry.participant_id)
    if (!person) {
      person = { who: entry.participant_id, email: emailByPid.get(entry.participant_id) ?? '', occurrences: [] }
      keyring.push(person)
    }
    const existing = person.occurrences.findIndex(o => o.edition_slug === entry.edition_slug)
    if (existing >= 0) person.occurrences[existing].token = entry.token
    else person.occurrences.push({ edition_slug: entry.edition_slug, token: entry.token })
  }

  writeFileSync(KEYRING_PATH, JSON.stringify(keyring, null, 2))
  console.log('Updated archive/redaction-keyring.json (admin-side, not deployed)')
}

if (import.meta.main) main().catch(e => { console.error(e); process.exit(1) })
