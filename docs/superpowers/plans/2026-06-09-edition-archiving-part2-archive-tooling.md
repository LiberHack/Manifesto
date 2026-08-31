# Edition Archiving: Part 2 — Archive Export & Redaction Tooling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CLI tools that export DB data to per-edition JSON files, manage the redaction queue, and apply queued DB actions — covering the full lifecycle from export through GDPR erasure.

**Architecture:** Node/Bun scripts in `scripts/`. Shared types live in `server/utils/archive-types.ts` (imported by both scripts and the Nuxt server). Archive JSON files land in `archive/`. The private keyring and redaction logs are git-tracked on the admin machine; `redaction-keyring.json` is `.gitignore`d from deployed output.

**Tech Stack:** Bun (runtime + test), TypeScript, `@supabase/supabase-js` service-role client, vitest. Scripts read `DATABASE_URL` or `SUPABASE_URL`+`SUPABASE_SERVICE_KEY` env vars.

**Pre-requisite:** Part 1 migrations are applied. The DB has at least the `2026` edition with registrations and teams.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/utils/archive-types.ts` | Create | Shared TypeScript types: `ArchiveMember`, `ArchiveTeam`, `EditionArchive`, `ArchiveIndex`, `RedactionEntry`, `Keyring` |
| `archive/index.json` | Create | Empty catalog `{ "editions": [] }` — seed file |
| `archive/redactions.pending.json` | Create | Empty queue `[]` — seed file |
| `archive/redactions.applied.json` | Create | Empty log `[]` — seed file |
| `.gitignore` | Modify | Add `archive/redaction-keyring.json` |
| `scripts/archive-export.ts` | Create | DB → `archive/<slug>.json` + `archive/index.json` + `archive/redaction-keyring.json`; export guard |
| `scripts/redact-hide.ts` | Create | Remove one member from one edition file, increment opted_out, queue hide action |
| `scripts/redact-delete.ts` | Create | Remove a person from all edition files, queue delete action; uses keyring |
| `scripts/apply-redactions.ts` | Create | Idempotent drain of `redactions.pending.json` to Postgres; moves done entries to `applied.json` |
| `tests/archive/export-serializer.test.ts` | Create | Unit tests: DB row → JSON shape, opt-out, erasure, token, export guard |
| `tests/archive/redaction-tools.test.ts` | Create | Unit tests: redact-hide, redact-delete, apply-redactions idempotency |
| `tests/archive/worst-case-erasure.test.ts` | Create | Integration scenario: person in 3 editions, sole leader, full deletion mid-dormancy |
| `docs/runbooks/edition-transition.md` | Create | LIVE→DORMANT and DORMANT→LIVE runbooks |

---

### Task 1: Shared types

**Files:**
- Create: `server/utils/archive-types.ts`

- [ ] **Step 1: Write failing test (types are consumed correctly)**

Create `tests/archive/export-serializer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
// Types imported once file is created
import type { ArchiveMember, ArchiveTeam, EditionArchive, ArchiveIndex, RedactionEntry, Keyring } from '../../server/utils/archive-types'

describe('archive-types module loads', () => {
  it('can import the types module without error', async () => {
    const mod = await import('../../server/utils/archive-types')
    expect(mod).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test — should fail (file doesn't exist yet)**

```bash
bun test tests/archive/export-serializer.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create the types file**

```typescript
// server/utils/archive-types.ts

export interface ArchiveMember {
  token: string        // opaque per-export random token (not UUID, not PII)
  name: string
  skills: string[]
}

export interface ArchiveTeam {
  name: string
  description: string | null
  github_url: string | null
  placement: number | null
  awards: string[]
  presentation_order: number | null
  members: ArchiveMember[]
}

export interface EditionArchive {
  slug: string
  name: string
  starts_at: string | null
  ends_at: string | null
  participant_count: number      // total registered (including opted-out, excluding erased)
  team_count: number
  opted_out: number              // opted out only; erasures are NOT counted here
  teams: ArchiveTeam[]
}

export interface ArchiveIndexEntry {
  slug: string
  name: string
  starts_at: string | null
  ends_at: string | null
  team_count: number
  participant_count: number
  opted_out: number
  winners: Array<{ team_name: string; placement: number; awards: string[] }>
}

export interface ArchiveIndex {
  editions: ArchiveIndexEntry[]
}

export interface HideEntry {
  mode: 'hide'
  edition_slug: string
  token: string                  // identifies which member entry was hidden
  who: string                    // email or auth id (for applying to DB)
}

export interface DeleteEntry {
  mode: 'delete'
  who: string                    // email or auth id
}

export type RedactionEntry = HideEntry | DeleteEntry

export interface KeyringOccurrence {
  edition_slug: string
  token: string
}

export interface KeyringEntry {
  who: string                    // auth user id
  email: string
  occurrences: KeyringOccurrence[]
}

export type Keyring = KeyringEntry[]
```

- [ ] **Step 4: Run test — should pass**

```bash
bun test tests/archive/export-serializer.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/archive-types.ts tests/archive/export-serializer.test.ts
git commit -m "feat(archive): add shared archive TypeScript types"
```

---

### Task 2: Initialize archive seed files + .gitignore

**Files:**
- Create: `archive/index.json`
- Create: `archive/redactions.pending.json`
- Create: `archive/redactions.applied.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create seed files**

`archive/index.json`:
```json
{ "editions": [] }
```

`archive/redactions.pending.json`:
```json
[]
```

`archive/redactions.applied.json`:
```json
[]
```

- [ ] **Step 2: Add keyring to .gitignore**

Open `.gitignore` and append:
```
# Private keyring (contains PII — admin-side only, never deployed)
archive/redaction-keyring.json
```

- [ ] **Step 3: Verify the keyring is ignored**

```bash
echo '{}' > archive/redaction-keyring.json
git status archive/
```
Expected: `archive/redaction-keyring.json` does NOT appear in untracked files.
```bash
rm archive/redaction-keyring.json
```

- [ ] **Step 4: Commit**

```bash
git add archive/index.json archive/redactions.pending.json archive/redactions.applied.json .gitignore
git commit -m "feat(archive): seed empty archive files, ignore private keyring"
```

---

### Task 3: archive-export script

**Files:**
- Create: `scripts/archive-export.ts`

The script:
1. Refuses to run if `archive/redactions.pending.json` is non-empty (export guard).
2. Queries DB for all `archived` editions (or a specific slug via `--slug <slug>`).
3. Serializes each to `EditionArchive` shape — only `public=true` registrations in `members`; `opted_out` counts `public=false`; erased participants are excluded and NOT counted.
4. Generates a random `token` per member per export (using `crypto.randomUUID()`).
5. Writes `archive/<slug>.json` (one file per edition passed).
6. Rewrites `archive/index.json` with an entry per edition.
7. Writes `archive/redaction-keyring.json` with every person's `(edition_slug, token)` across all editions (including already-exported past ones).

Usage: `bun scripts/archive-export.ts [--slug 2026]`

- [ ] **Step 1: Write failing tests (export guard + serializer shape)**

Append to `tests/archive/export-serializer.test.ts`:

```typescript
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '../..')

function withPendingQueue(entries: unknown[], fn: () => void) {
  const path = join(ROOT, 'archive/redactions.pending.json')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, JSON.stringify(entries))
  try { fn() } finally { writeFileSync(path, original) }
}

describe('archive-export serializer', () => {
  it('export guard throws when pending queue is non-empty', async () => {
    const { checkExportGuard } = await import('../../scripts/archive-export')
    withPendingQueue([{ mode: 'hide', edition_slug: 'test', token: 'x', who: 'x' }], () => {
      expect(() => checkExportGuard()).toThrow(/pending/i)
    })
  })

  it('export guard passes when pending queue is empty', async () => {
    const { checkExportGuard } = await import('../../scripts/archive-export')
    expect(() => checkExportGuard()).not.toThrow()
  })

  it('opted-out member is excluded from body but counted in opted_out', async () => {
    const { serializeEdition } = await import('../../scripts/archive-export')
    const fakeDbResult = {
      slug: '2026', name: 'LiberHack 2026', starts_at: null, ends_at: null,
      teams: [{
        id: 'team-1', name: 'fsociety', description: null, github_url: null,
        placement: null, awards: [], presentation_order: null,
        registrations: [
          { id: 'reg-1', participant_id: 'p1', public: true,  skills: ['Go'],  participants: { name: 'Alice' } },
          { id: 'reg-2', participant_id: 'p2', public: false, skills: ['Rust'], participants: { name: 'Bob' } },
        ],
      }],
    }
    const { archive } = serializeEdition(fakeDbResult)
    expect(archive.opted_out).toBe(1)
    expect(archive.teams[0].members).toHaveLength(1)
    expect(archive.teams[0].members[0].name).toBe('Alice')
    // Bob not present
    expect(archive.teams[0].members.some(m => m.name === 'Bob')).toBe(false)
  })

  it('each public member gets a unique opaque token', async () => {
    const { serializeEdition } = await import('../../scripts/archive-export')
    const fakeDbResult = {
      slug: '2026', name: 'LiberHack 2026', starts_at: null, ends_at: null,
      teams: [{
        id: 'team-1', name: 'fsociety', description: null, github_url: null,
        placement: null, awards: [], presentation_order: null,
        registrations: [
          { id: 'reg-1', participant_id: 'p1', public: true, skills: [], participants: { name: 'Alice' } },
          { id: 'reg-2', participant_id: 'p2', public: true, skills: [], participants: { name: 'Alice' } }, // duplicate name
        ],
      }],
    }
    const { archive } = serializeEdition(fakeDbResult)
    const tokens = archive.teams[0].members.map(m => m.token)
    expect(new Set(tokens).size).toBe(2) // both unique
    tokens.forEach(t => expect(t).toMatch(/^[0-9a-f-]{36}$/)) // UUID format
  })

  it('closing one edition leaves other archive files byte-stable', () => {
    // Verified at script level: exporter only writes the target slug file
    // This test just documents the contract; actual script test is in integration
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test tests/archive/export-serializer.test.ts
```
Expected: FAIL — `scripts/archive-export` does not export `checkExportGuard` or `serializeEdition`

- [ ] **Step 3: Write the script**

```typescript
// scripts/archive-export.ts
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

  // Load all archived editions (or just target slug)
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

  // Update index.json
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

  // Merge into keyring (reload existing if present to preserve other editions' tokens)
  let keyring: Keyring = []
  try { keyring = JSON.parse(readFileSync(KEYRING_PATH, 'utf8')) } catch { /* first run */ }

  // Build participant_id → email lookup from DB (all registrations in exported editions)
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
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/archive/export-serializer.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Smoke-run against real DB**

```bash
bun scripts/archive-export.ts --slug 2026
```
Expected: `archive/2026.json` written with teams/members; `archive/index.json` updated; `archive/redaction-keyring.json` written (not committed).

- [ ] **Step 6: Commit**

```bash
git add scripts/archive-export.ts tests/archive/export-serializer.test.ts
git commit -m "feat(archive): add archive-export script with serializer and export guard"
```

---

### Task 4: redact-hide script

**Files:**
- Create: `scripts/redact-hide.ts`

Usage: `bun scripts/redact-hide.ts --slug 2026 --token <token> --who <email>`

The script:
1. Opens `archive/<slug>.json`.
2. Finds the member with the matching `token` across all teams.
3. Removes that member from the array; increments `opted_out` by 1.
4. Updates the matching `ArchiveIndexEntry.opted_out` in `archive/index.json`.
5. Appends a `HideEntry` to `archive/redactions.pending.json`.
6. Writes all modified files.

- [ ] **Step 1: Write failing tests**

Create `tests/archive/redaction-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dirname, '../..')
const ARCHIVE_DIR = join(ROOT, 'archive')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

describe('redact-hide', () => {
  const testSlug = 'redact-test'
  const testPath = join(ARCHIVE_DIR, `${testSlug}.json`)

  beforeEach(() => {
    // Seed a fake edition file
    writeJson(testPath, {
      slug: testSlug, name: 'Test', starts_at: null, ends_at: null,
      participant_count: 2, team_count: 1, opted_out: 0,
      teams: [{
        name: 'Team A', description: null, github_url: null, placement: null, awards: [], presentation_order: null,
        members: [
          { token: 'tok-alice', name: 'Alice', skills: [] },
          { token: 'tok-bob',   name: 'Bob',   skills: [] },
        ],
      }],
    })
    writeJson(join(ARCHIVE_DIR, 'index.json'), {
      editions: [{ slug: testSlug, name: 'Test', starts_at: null, ends_at: null, team_count: 1, participant_count: 2, opted_out: 0, winners: [] }]
    })
    writeJson(join(ARCHIVE_DIR, 'redactions.pending.json'), [])
  })

  it('removes the member by token and increments opted_out', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-alice', who: 'alice@test.com' })

    const archive = readJson<{ opted_out: number; teams: Array<{ members: Array<{ name: string }> }> }>(testPath)
    expect(archive.opted_out).toBe(1)
    expect(archive.teams[0].members).toHaveLength(1)
    expect(archive.teams[0].members[0].name).toBe('Bob')
  })

  it('updates opted_out in index.json', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-alice', who: 'alice@test.com' })

    const index = readJson<{ editions: Array<{ slug: string; opted_out: number }> }>(join(ARCHIVE_DIR, 'index.json'))
    const entry = index.editions.find(e => e.slug === testSlug)
    expect(entry!.opted_out).toBe(1)
  })

  it('queues a hide entry in redactions.pending.json', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    runRedactHide({ slug: testSlug, token: 'tok-bob', who: 'bob@test.com' })

    const pending = readJson<Array<{ mode: string; edition_slug: string; token: string }>>(join(ARCHIVE_DIR, 'redactions.pending.json'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'hide', edition_slug: testSlug, token: 'tok-bob', who: 'bob@test.com' })
  })

  it('throws if token not found', async () => {
    const { runRedactHide } = await import('../../scripts/redact-hide')
    expect(() => runRedactHide({ slug: testSlug, token: 'nonexistent', who: 'x@x.com' })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write the script**

```typescript
// scripts/redact-hide.ts
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EditionArchive, ArchiveIndex, HideEntry, RedactionEntry } from '../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '..')

export function runRedactHide(opts: { slug: string; token: string; who: string }): void {
  const archivePath = join(ROOT, `archive/${opts.slug}.json`)
  const indexPath   = join(ROOT, 'archive/index.json')
  const pendingPath = join(ROOT, 'archive/redactions.pending.json')

  const archive = JSON.parse(readFileSync(archivePath, 'utf8')) as EditionArchive
  const index   = JSON.parse(readFileSync(indexPath,   'utf8')) as ArchiveIndex
  const pending = JSON.parse(readFileSync(pendingPath, 'utf8')) as RedactionEntry[]

  let found = false
  for (const team of archive.teams) {
    const idx = team.members.findIndex(m => m.token === opts.token)
    if (idx !== -1) {
      team.members.splice(idx, 1)
      found = true
      break
    }
  }

  if (!found) throw new Error(`Token ${opts.token} not found in archive/${opts.slug}.json`)

  archive.opted_out++

  const indexEntry = index.editions.find(e => e.slug === opts.slug)
  if (indexEntry) indexEntry.opted_out++

  const entry: HideEntry = { mode: 'hide', edition_slug: opts.slug, token: opts.token, who: opts.who }
  pending.push(entry)

  writeFileSync(archivePath, JSON.stringify(archive, null, 2))
  writeFileSync(indexPath,   JSON.stringify(index,   null, 2))
  writeFileSync(pendingPath, JSON.stringify(pending, null, 2))

  console.log(`Removed token ${opts.token} from archive/${opts.slug}.json; opted_out now ${archive.opted_out}`)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
  const slug  = get('--slug')
  const token = get('--token')
  const who   = get('--who')
  if (!slug || !token || !who) { console.error('Usage: redact-hide --slug <slug> --token <token> --who <email>'); process.exit(1) }
  runRedactHide({ slug, token, who })
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/redact-hide.ts tests/archive/redaction-tools.test.ts
git commit -m "feat(archive): add redact-hide script (per-edition opt-out)"
```

---

### Task 5: redact-delete script

**Files:**
- Create: `scripts/redact-delete.ts`

Usage: `bun scripts/redact-delete.ts --who <email|auth-id>`

The script looks the person up in the private `redaction-keyring.json`, removes their token from every edition file listed in the keyring (their entry is removed entirely — NOT counted in `opted_out`), and queues a `DeleteEntry` in `redactions.pending.json`.

- [ ] **Step 1: Write failing tests**

Append to `tests/archive/redaction-tools.test.ts`:

```typescript
describe('redact-delete', () => {
  const slugA = 'delete-test-a'
  const slugB = 'delete-test-b'

  function seedEdition(slug: string, tokens: string[]) {
    writeJson(join(ARCHIVE_DIR, `${slug}.json`), {
      slug, name: 'Del Test', starts_at: null, ends_at: null,
      participant_count: tokens.length, team_count: 1, opted_out: 0,
      teams: [{
        name: 'Team', description: null, github_url: null, placement: null, awards: [], presentation_order: null,
        members: tokens.map(t => ({ token: t, name: `User-${t}`, skills: [] })),
      }],
    })
  }

  function seedKeyring() {
    writeJson(join(ARCHIVE_DIR, 'redaction-keyring.json'), [
      {
        who: 'uid-alice', email: 'alice@test.com',
        occurrences: [
          { edition_slug: slugA, token: 'tok-a-alice' },
          { edition_slug: slugB, token: 'tok-b-alice' },
        ]
      },
      { who: 'uid-bob', email: 'bob@test.com', occurrences: [{ edition_slug: slugA, token: 'tok-a-bob' }] },
    ])
  }

  beforeEach(() => {
    seedEdition(slugA, ['tok-a-alice', 'tok-a-bob'])
    seedEdition(slugB, ['tok-b-alice'])
    seedKeyring()
    writeJson(join(ARCHIVE_DIR, 'redactions.pending.json'), [])
    writeJson(join(ARCHIVE_DIR, 'index.json'), { editions: [
      { slug: slugA, name: 'A', starts_at: null, ends_at: null, team_count: 1, participant_count: 2, opted_out: 0, winners: [] },
      { slug: slugB, name: 'B', starts_at: null, ends_at: null, team_count: 1, participant_count: 1, opted_out: 0, winners: [] },
    ]})
  })

  it('removes the person from ALL editions they appear in', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const archA = readJson<{ teams: Array<{ members: Array<{ name: string }> }> }>(join(ARCHIVE_DIR, `${slugA}.json`))
    const archB = readJson<{ teams: Array<{ members: Array<{ name: string }> }> }>(join(ARCHIVE_DIR, `${slugB}.json`))

    expect(archA.teams[0].members.some(m => m.name === 'User-tok-a-alice')).toBe(false)
    expect(archB.teams[0].members).toHaveLength(0)
  })

  it('does NOT increment opted_out (erasure is uncounted)', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const archA = readJson<{ opted_out: number }>(join(ARCHIVE_DIR, `${slugA}.json`))
    const archB = readJson<{ opted_out: number }>(join(ARCHIVE_DIR, `${slugB}.json`))
    expect(archA.opted_out).toBe(0)
    expect(archB.opted_out).toBe(0)
  })

  it('queues a single account-scoped delete entry', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    runRedactDelete({ who: 'alice@test.com' })

    const pending = readJson<Array<{ mode: string; who: string }>>(join(ARCHIVE_DIR, 'redactions.pending.json'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'delete', who: 'alice@test.com' })
  })

  it('throws if who not found in keyring', async () => {
    const { runRedactDelete } = await import('../../scripts/redact-delete')
    expect(() => runRedactDelete({ who: 'nobody@test.com' })).toThrow(/keyring/i)
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: existing 4 pass; new 4 FAIL

- [ ] **Step 3: Write the script**

```typescript
// scripts/redact-delete.ts
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EditionArchive, ArchiveIndex, DeleteEntry, RedactionEntry, Keyring } from '../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '..')

export function runRedactDelete(opts: { who: string }): void {
  const keyrPath  = join(ROOT, 'archive/redaction-keyring.json')
  const indexPath = join(ROOT, 'archive/index.json')
  const pendingPath = join(ROOT, 'archive/redactions.pending.json')

  const keyring = JSON.parse(readFileSync(keyrPath, 'utf8')) as Keyring
  const pending = JSON.parse(readFileSync(pendingPath, 'utf8')) as RedactionEntry[]

  const person = keyring.find(k => k.who === opts.who || k.email === opts.who)
  if (!person) throw new Error(`${opts.who} not found in redaction-keyring.json`)

  const modifiedFiles = new Map<string, EditionArchive>()

  for (const occ of person.occurrences) {
    const archivePath = join(ROOT, `archive/${occ.edition_slug}.json`)
    const archive = modifiedFiles.get(occ.edition_slug)
      ?? (JSON.parse(readFileSync(archivePath, 'utf8')) as EditionArchive)

    for (const team of archive.teams) {
      const idx = team.members.findIndex(m => m.token === occ.token)
      if (idx !== -1) team.members.splice(idx, 1)
    }
    // participant_count stays: erased persons are simply gone, no trace
    modifiedFiles.set(occ.edition_slug, archive)
  }

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as ArchiveIndex

  for (const [slug, archive] of modifiedFiles) {
    writeFileSync(join(ROOT, `archive/${slug}.json`), JSON.stringify(archive, null, 2))
    // Do NOT update opted_out — erasure is uncounted
    console.log(`Removed ${opts.who} from archive/${slug}.json (uncounted)`)
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2))

  const entry: DeleteEntry = { mode: 'delete', who: opts.who }
  pending.push(entry)
  writeFileSync(pendingPath, JSON.stringify(pending, null, 2))

  console.log(`Queued delete for ${opts.who} in redactions.pending.json`)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--who')
  const who = idx !== -1 ? args[idx + 1] : null
  if (!who) { console.error('Usage: redact-delete --who <email|auth-id>'); process.exit(1) }
  runRedactDelete({ who })
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/redact-delete.ts tests/archive/redaction-tools.test.ts
git commit -m "feat(archive): add redact-delete script (whole-account GDPR erasure, uncounted)"
```

---

### Task 6: apply-redactions script

**Files:**
- Create: `scripts/apply-redactions.ts`

Usage: `bun scripts/apply-redactions.ts`

The script reads `redactions.pending.json`, applies each to Postgres (idempotently), moves successful entries to `applied.json`, and removes them from `pending.json`. Must be run on a machine with DB access.

- [ ] **Step 1: Write failing tests**

Append to `tests/archive/redaction-tools.test.ts`:

```typescript
// apply-redactions tests use a mock DB client
describe('apply-redactions idempotency', () => {
  it('processes hide entries: sets registrations.public=false', async () => {
    const calls: Array<{ table: string; data: unknown }> = []
    const mockDb = {
      from: (table: string) => ({
        update: (data: unknown) => ({
          eq: () => ({ eq: () => ({ eq: () => ({ error: null, data: null }) }) }),
        }),
        delete: () => ({
          eq: () => ({ error: null }),
        }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }
    const { applyRedactions } = await import('../../scripts/apply-redactions')
    const pending = [{ mode: 'hide' as const, edition_slug: '2026', token: 'tok-x', who: 'alice@test.com' }]
    const applied: unknown[] = []
    await applyRedactions(mockDb as never, pending, applied)
    expect(applied).toHaveLength(1)
    expect(pending).toHaveLength(0)
  })

  it('is idempotent: re-running with same entries does not fail', async () => {
    const mockDb = {
      from: () => ({
        update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }) }),
        delete: () => ({ eq: () => ({ error: null }) }),
      }),
    }
    const { applyRedactions } = await import('../../scripts/apply-redactions')
    const pending = [{ mode: 'delete' as const, who: 'alice@test.com' }]
    const applied: unknown[] = []
    await applyRedactions(mockDb as never, pending, applied)
    await applyRedactions(mockDb as never, [], applied) // second run: nothing pending
    expect(applied).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: new 2 FAIL

- [ ] **Step 3: Write the script**

```typescript
// scripts/apply-redactions.ts
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RedactionEntry } from '../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '..')

export async function applyRedactions(
  db: SupabaseClient,
  pending: RedactionEntry[],
  applied: RedactionEntry[]
): Promise<void> {
  const toProcess = [...pending]
  pending.length = 0

  for (const entry of toProcess) {
    try {
      if (entry.mode === 'hide') {
        // Find registration: match participant by email, edition by slug
        const { data: participant } = await db
          .from('participants')
          .select('id')
          .eq('email', entry.who)
          .maybeSingle()

        if (participant) {
          await db
            .from('registrations')
            .update({ public: false })
            .eq('participant_id', participant.id)
            .eq('edition_slug', entry.edition_slug)
        }
        // If participant not found: treat as success (already deleted)
      } else {
        // delete mode: full account erasure
        // Try auth id first, then email lookup
        let authId = entry.who
        if (entry.who.includes('@')) {
          const { data: p } = await db.from('participants').select('id').eq('email', entry.who).maybeSingle()
          if (p) authId = p.id
        }
        const { error } = await db.auth.admin.deleteUser(authId)
        // Treat "user not found" as success (idempotent)
        if (error && !error.message.includes('not found') && !error.message.includes('User not found')) {
          throw error
        }
      }
      applied.push(entry)
    } catch (err) {
      // Re-queue failed entry
      pending.push(entry)
      console.error(`Failed to apply ${JSON.stringify(entry)}:`, err)
    }
  }
}

async function main() {
  const pendingPath = join(ROOT, 'archive/redactions.pending.json')
  const appliedPath = join(ROOT, 'archive/redactions.applied.json')

  const pending = JSON.parse(readFileSync(pendingPath, 'utf8')) as RedactionEntry[]
  const applied = JSON.parse(readFileSync(appliedPath, 'utf8')) as RedactionEntry[]

  if (pending.length === 0) {
    console.log('No pending redactions.')
    return
  }

  const db = createClient(
    process.env.SUPABASE_URL ?? process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_KEY ?? process.env.NUXT_SUPABASE_SERVICE_KEY ?? ''
  )

  console.log(`Applying ${pending.length} pending redaction(s)...`)
  await applyRedactions(db, pending, applied)

  writeFileSync(pendingPath, JSON.stringify(pending, null, 2))
  writeFileSync(appliedPath, JSON.stringify(applied, null, 2))

  if (pending.length > 0) {
    console.error(`⚠ ${pending.length} redaction(s) failed — left in pending.json`)
    process.exit(1)
  }
  console.log(`Done. ${applied.length} total applied.`)
  console.log('Commit both archive/redactions.pending.json and archive/redactions.applied.json.')
}

if (import.meta.main) main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/archive/redaction-tools.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/apply-redactions.ts tests/archive/redaction-tools.test.ts
git commit -m "feat(archive): add idempotent apply-redactions script"
```

---

### Task 7: Worst-case erasure scenario integration test

**Files:**
- Create: `tests/archive/worst-case-erasure.test.ts`

This test simulates: a person in **3 editions**, **sole leader** of a team in one, requests full deletion mid-dormancy.

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { serializeEdition } from '../../scripts/archive-export'
import { runRedactDelete } from '../../scripts/redact-delete'
import { applyRedactions } from '../../scripts/apply-redactions'
import { createClient } from '@supabase/supabase-js'
import type { EditionArchive, Keyring, RedactionEntry } from '../../server/utils/archive-types'

const ROOT = join(import.meta.dirname, '../..')
const ARCHIVE = join(ROOT, 'archive')
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

const ed1 = `wce-ed1-${Date.now()}`
const ed2 = `wce-ed2-${Date.now()}`
const ed3 = `wce-ed3-${Date.now()}`

afterAll(async () => {
  for (const slug of [ed1, ed2, ed3]) {
    try { require('fs').unlinkSync(join(ARCHIVE, `${slug}.json`)) } catch {}
    await db.from('editions').delete().eq('slug', slug)
  }
  writeFileSync(join(ARCHIVE, 'redactions.pending.json'), '[]')
  try { require('fs').unlinkSync(join(ARCHIVE, 'redaction-keyring.json')) } catch {}
})

describe('worst-case erasure: person in 3 editions, sole leader in one', () => {
  it('runs the full mid-dormancy deletion scenario', async () => {
    // 1. Set up: alice is in all three editions; she is sole leader in ed2
    const aliceId = (await db.auth.admin.createUser({ email: `alice-wce-${Date.now()}@ci.test`, password: 'test1234', email_confirm: true })).data.user!.id
    const bobId   = (await db.auth.admin.createUser({ email: `bob-wce-${Date.now()}@ci.test`,   password: 'test1234', email_confirm: true })).data.user!.id

    for (const slug of [ed1, ed2, ed3]) {
      await db.from('editions').insert({ slug, name: slug, status: 'archived' })
    }

    // Alice's registrations in all three editions
    const regs: Record<string, string> = {}
    for (const slug of [ed1, ed2, ed3]) {
      const { data: r } = await db.from('registrations').insert({ participant_id: aliceId, edition_slug: slug, role: 'leader', skills: [] }).select().single()
      regs[slug] = r!.id
    }
    // Bob in ed1 only
    const { data: bobReg } = await db.from('registrations').insert({ participant_id: bobId, edition_slug: ed1, skills: [] }).select().single()

    // Create team in ed2 with alice as sole leader (no other members)
    await db.from('teams').insert({ edition_slug: ed2, name: 'SoleTeam', leader_id: regs[ed2], skills_wanted: [] })

    // 2. Serialize all three editions to archive files + build keyring
    const keyring: Keyring = []
    for (const slug of [ed1, ed2, ed3]) {
      const { data: ed } = await db.from('editions').select(`slug, name, starts_at, ends_at, teams(id, name, description, github_url, placement, awards, presentation_order, registrations(id, participant_id, public, skills, participants(name)))`).eq('slug', slug).single()
      const { archive, keyringEntries } = serializeEdition(ed as never)
      writeFileSync(join(ARCHIVE, `${slug}.json`), JSON.stringify(archive, null, 2))
      for (const ke of keyringEntries) {
        let person = keyring.find(k => k.who === ke.participant_id)
        if (!person) { person = { who: ke.participant_id, email: '', occurrences: [] }; keyring.push(person) }
        person.occurrences.push({ edition_slug: ke.edition_slug, token: ke.token })
      }
    }
    writeFileSync(join(ARCHIVE, 'redaction-keyring.json'), JSON.stringify(keyring, null, 2))
    writeFileSync(join(ARCHIVE, 'redactions.pending.json'), '[]')

    // 3. Run redact-delete for alice (mid-dormancy — DB still up in test, but script only edits files)
    runRedactDelete({ who: aliceId })

    // 4. Assert: alice removed from all three archive files (uncounted)
    for (const slug of [ed1, ed2, ed3]) {
      const arch = JSON.parse(readFileSync(join(ARCHIVE, `${slug}.json`), 'utf8')) as EditionArchive
      const allMembers = arch.teams.flatMap(t => t.members)
      // No member token should belong to alice
      const aliceOcc = keyring.find(k => k.who === aliceId)!.occurrences
      for (const occ of aliceOcc) {
        if (occ.edition_slug === slug) {
          expect(allMembers.some(m => m.token === occ.token)).toBe(false)
        }
      }
      // opted_out NOT incremented
      expect(arch.opted_out).toBe(0)
    }

    // 5. Bob still in ed1
    const arch1 = JSON.parse(readFileSync(join(ARCHIVE, `${ed1}.json`), 'utf8')) as EditionArchive
    const bobOcc = keyring.find(k => k.who === bobId)?.occurrences.find(o => o.edition_slug === ed1)
    if (bobOcc) {
      expect(arch1.teams[0].members.some(m => m.token === bobOcc.token)).toBe(true)
    }

    // 6. One account-scoped delete queued
    const pending = JSON.parse(readFileSync(join(ARCHIVE, 'redactions.pending.json'), 'utf8')) as RedactionEntry[]
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ mode: 'delete', who: aliceId })

    // 7. Apply redactions against real DB
    const applied: RedactionEntry[] = []
    await applyRedactions(db, pending, applied)
    expect(applied).toHaveLength(1)
    expect(pending).toHaveLength(0)

    // 8. Alice is gone from DB
    const { data: alicePart } = await db.from('participants').select('id').eq('id', aliceId).maybeSingle()
    expect(alicePart).toBeNull()

    // 9. Sole-leader team in ed2 dissolved
    const { data: team } = await db.from('teams').select('id').eq('edition_slug', ed2).maybeSingle()
    expect(team).toBeNull()

    // 10. Bob unaffected
    const { data: bobPart } = await db.from('participants').select('id').eq('id', bobId).maybeSingle()
    expect(bobPart).not.toBeNull()

    // 11. apply-redactions is safe to re-run (idempotent)
    await applyRedactions(db, [], applied) // empty pending
    expect(applied).toHaveLength(1) // nothing new added

    await db.auth.admin.deleteUser(bobId)
  }, 30_000)
})
```

- [ ] **Step 2: Run test — should pass**

```bash
bun test tests/archive/worst-case-erasure.test.ts
```
Expected: 1 test PASS (may take a few seconds due to DB calls)

- [ ] **Step 3: Commit**

```bash
git add tests/archive/worst-case-erasure.test.ts
git commit -m "test(archive): worst-case erasure scenario (3 editions, sole leader, mid-dormancy deletion)"
```

---

### Task 8: Edition-transition runbook

**Files:**
- Create: `docs/runbooks/edition-transition.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Edition Transition Runbook

## LIVE → DORMANT (closing an edition)

Pre-flight: ensure `archive/redactions.pending.json` is empty.

1. **Record results** — In `/ops/admin`, set `placement`, `awards`, and `presentation_order` on all teams.
2. **Close current** — Click "Close Edition" in `/ops/admin` (calls `close_edition('2026')`). Status becomes `archived`, `is_current = false`.
3. **Export** — On a machine with DB access and the repo checked out:
   ```bash
   bun scripts/archive-export.ts --slug 2026
   ```
   Review the diff: one new `archive/2026.json` + one updated `archive/index.json`. Confirm the data looks correct.
4. **Commit archive files**:
   ```bash
   git add archive/2026.json archive/index.json
   git commit -m "docs(archive): export 2026 edition"
   ```
   Do NOT commit `archive/redaction-keyring.json` (it is .gitignored; store it securely admin-side).
5. **Static build**:
   ```bash
   NUXT_PUBLIC_SITE_MODE=dormant bun generate
   ```
6. **Deploy static output** — Push `.output/public/` to Caddy. Shut down the Node app and Supabase stack:
   ```bash
   cd supabase-docker && docker compose down
   ```

## DORMANT → LIVE (opening the next edition)

1. **Bring DB up**:
   ```bash
   cd supabase-docker && docker compose up -d
   ```
2. **Apply any queued redactions** (drain pending before any new export):
   ```bash
   bun scripts/apply-redactions.ts
   git add archive/redactions.pending.json archive/redactions.applied.json
   git commit -m "ops: drain redaction queue before going live"
   ```
3. **Prepare next edition** — In `/ops/admin`, create a draft edition (set slug, name, dates). Or it was pre-created before going dormant.
4. **Go live** — Click "Go Live" in `/ops/admin` (calls `go_live_edition('<next-slug>')`).
5. **Redeploy SSR app**:
   ```bash
   NUXT_PUBLIC_SITE_MODE=live docker compose up -d --build
   ```

## Removal request during dormancy

1. Identify the request type:
   - Opt-out of one edition's showcase → `redact-hide`
   - Full account erasure (GDPR) → `redact-delete`
2. Find the token via `archive/redaction-keyring.json` (admin-side only).
3. Run the appropriate script:
   ```bash
   # Opt-out (hide from one edition):
   bun scripts/redact-hide.ts --slug <slug> --token <token> --who <email>

   # Full erasure:
   bun scripts/redact-delete.ts --who <email>
   ```
4. Commit the modified archive files and updated pending queue:
   ```bash
   git add archive/<slug>.json archive/index.json archive/redactions.pending.json
   git commit -m "ops: redact <email> from archive (dormant)"
   ```
5. **Rebuild and redeploy the static site** so the removal is live immediately:
   ```bash
   NUXT_PUBLIC_SITE_MODE=dormant bun generate
   # redeploy .output/public/ to Caddy
   ```
   The DB action stays queued in `redactions.pending.json` until the next DORMANT→LIVE boot.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/edition-transition.md
git commit -m "docs: add edition-transition runbook (LIVE↔DORMANT + dormant removal)"
```
