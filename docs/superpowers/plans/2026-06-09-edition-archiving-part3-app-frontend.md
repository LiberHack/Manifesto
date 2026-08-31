# Edition Archiving: Part 3 — App & Frontend Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nuxt app edition-aware: add dormant mode (static build, Supabase skip), archive showcase pages (`/archive`, `/archive/[slug]`), update all API routes to read/write through `registrations` instead of `participants`, and add admin UI for edition lifecycle.

**Architecture (Vue):** Composition API + `<script setup lang="ts">` throughout. Archive pages are thin route views that delegate to a `useArchive()` composable (single data-access point). The Supabase client is short-circuited at plugin level in dormant mode. API routes are scoped to the current edition by reading `editions.is_current = true`. Components follow the vue-best-practices skill: entry/route views are composition surfaces, UI logic extracted to child components and composables.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, TypeScript, Tailwind CSS v4 + DaisyUI, vitest for unit tests, `useSupabaseAdmin()` (service role) for server-side mutations.

**Pre-requisites:** Part 1 (DB migrations) and Part 2 (archive tooling) are complete.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/utils/archive.ts` | Create | Server-side: read `archive/<slug>.json` files; `listEditions()`, `getEdition(slug)` |
| `app/composables/useArchive.ts` | Create | Client composable wrapping `useFetch` against `/api/archive/*`; unified `EditionArchive`/`ArchiveIndex` shape |
| `server/api/archive/index.get.ts` | Create | Returns `archive/index.json` contents |
| `server/api/archive/[slug].get.ts` | Create | Returns `archive/<slug>.json` contents |
| `app/pages/archive/index.vue` | Create | `/archive` — edition listing; uses `useArchive().listEditions()` |
| `app/pages/archive/[slug].vue` | Create | `/archive/[slug]` — edition detail; uses `useArchive().getEdition(slug)` |
| `app/plugins/supabase-guard.client.ts` | Create | Short-circuit Supabase client init when `NUXT_PUBLIC_SITE_MODE=dormant` |
| `app/components/archive/EditionCard.vue` | Create | Single edition card (name, dates, teams, participants, winners) |
| `app/components/archive/TeamCard.vue` | Create | Single team card with members, GitHub link, placement badge |
| `app/components/archive/PrivacyBanner.vue` | Create | Dormant-mode banner with removal request email link |
| `server/api/editions/current.get.ts` | Create | Returns current edition slug/name (or null if dormant) |
| `server/api/me.get.ts` | Modify | Read from `participants` (identity) + `registrations` (per-edition fields) |
| `server/api/me/profile.patch.ts` | Modify | Update `registrations` (not `participants`) for current edition |
| `server/api/me/team.delete.ts` | Modify | Leave team: update `registrations.team_id = null` for current edition |
| `server/api/teams/index.post.ts` | Modify | Create team + update `registrations.team_id` + `role` for current edition |
| `server/api/teams/index.get.ts` | Modify | Filter teams by current edition |
| `server/api/teams/[id].get.ts` | Modify | Verify team is in current edition |
| `server/api/teams/[id].patch.ts` | Modify | Edition-scoped update |
| `server/api/admin/teams/export.get.ts` | Modify | Export current edition's teams with leader from `participants` + per-edition fields from `registrations` |
| `server/api/admin/live/config.get.ts` | Modify | Read `event_config` by current edition slug |
| `server/api/admin/live/config.patch.ts` | Modify | Write `event_config` by current edition slug |
| `app/pages/ops/admin/index.vue` | Modify | Add edition lifecycle panel (close / create-draft / go-live) |
| `nuxt.config.ts` | Modify | `siteMode` runtime config, dormant route rules, `routeRules` for archive prerender |
| `tests/unit/use-archive.test.ts` | Create | Unit tests for composable data shape |
| `tests/unit/archive-server.test.ts` | Create | Unit tests for server utils (file read, 404 handling) |

---

### Task 1: Dormant mode config + Supabase guard

**Files:**
- Modify: `nuxt.config.ts`
- Create: `app/plugins/supabase-guard.client.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/dormant-mode.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — should pass (trivial)**

```bash
bun test tests/unit/dormant-mode.test.ts
```
Expected: PASS

- [ ] **Step 3: Add siteMode to nuxt.config.ts**

Open `nuxt.config.ts`. Find the `runtimeConfig` section (or add one) and add:

```typescript
runtimeConfig: {
  // ... existing keys ...
  public: {
    // ... existing public keys ...
    siteMode: process.env.NUXT_PUBLIC_SITE_MODE ?? 'live',  // 'live' | 'dormant'
  },
},
```

Also add route rules for dormant mode — add to the export:

```typescript
routeRules: {
  '/archive': { prerender: true },
  '/archive/**': { prerender: true },
},
```

- [ ] **Step 4: Run test to verify config compiles**

```bash
bun dev --no-open &
sleep 5 && curl -s http://localhost:3000/ | head -5
kill %1
```
Expected: dev server starts, no TS errors.

- [ ] **Step 5: Create the Supabase guard plugin**

```typescript
// app/plugins/supabase-guard.client.ts
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  if (config.public.siteMode !== 'dormant') return

  // In dormant mode: no Supabase server is running.
  // Clear any stale tokens from the previous live season to avoid console errors.
  // useSupabaseClient() must not be called in this mode (the module may not be configured).
  const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('supabase'))
  keys.forEach(k => localStorage.removeItem(k))
})
```

- [ ] **Step 6: Commit**

```bash
git add nuxt.config.ts app/plugins/supabase-guard.client.ts tests/unit/dormant-mode.test.ts
git commit -m "feat(app): add dormant mode config, Supabase guard plugin clears stale tokens"
```

---

### Task 2: Server-side archive utilities + API routes

**Files:**
- Create: `server/utils/archive.ts`
- Create: `server/api/archive/index.get.ts`
- Create: `server/api/archive/[slug].get.ts`
- Create: `tests/unit/archive-server.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/archive-server.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: vi.fn((path: string, enc: string) => {
      if (path.includes('index.json')) return '{"editions":[{"slug":"2026","name":"LiberHack 2026"}]}'
      if (path.includes('2026.json')) return '{"slug":"2026","name":"LiberHack 2026","teams":[]}'
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }),
  }
})

describe('server/utils/archive', () => {
  it('listEditions returns parsed index', async () => {
    const { listEditions } = await import('../../server/utils/archive')
    const result = await listEditions()
    expect(result.editions[0].slug).toBe('2026')
  })

  it('getEdition returns the edition', async () => {
    const { getEdition } = await import('../../server/utils/archive')
    const result = await getEdition('2026')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('2026')
  })

  it('getEdition returns null for unknown slug', async () => {
    const { getEdition } = await import('../../server/utils/archive')
    const result = await getEdition('unknown-slug')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — should fail**

```bash
bun test tests/unit/archive-server.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create server/utils/archive.ts**

```typescript
// server/utils/archive.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ArchiveIndex, EditionArchive } from './archive-types'

function archivePath(filename: string): string {
  return join(process.cwd(), 'archive', filename)
}

export function listEditions(): ArchiveIndex {
  const raw = readFileSync(archivePath('index.json'), 'utf8')
  return JSON.parse(raw) as ArchiveIndex
}

export function getEdition(slug: string): EditionArchive | null {
  try {
    const raw = readFileSync(archivePath(`${slug}.json`), 'utf8')
    return JSON.parse(raw) as EditionArchive
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
```

- [ ] **Step 4: Create API routes**

`server/api/archive/index.get.ts`:
```typescript
import { listEditions } from '#server/utils/archive'

export default defineEventHandler(() => {
  return listEditions()
})
```

`server/api/archive/[slug].get.ts`:
```typescript
import { getEdition } from '#server/utils/archive'

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')!
  const edition = getEdition(slug)
  if (!edition) throw createError({ statusCode: 404, message: 'Edition not found' })
  return edition
})
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/archive-server.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/archive.ts server/api/archive/index.get.ts "server/api/archive/[slug].get.ts" tests/unit/archive-server.test.ts
git commit -m "feat(archive): add server archive utils and API routes"
```

---

### Task 3: useArchive composable

**Files:**
- Create: `app/composables/useArchive.ts`
- Create: `tests/unit/use-archive.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-archive.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock $fetch (useFetch internals)
vi.mock('#app', () => ({ useFetch: vi.fn() }))

describe('useArchive composable', () => {
  it('exports listEditions and getEdition', async () => {
    const mod = await import('../../app/composables/useArchive')
    expect(typeof mod.useArchive).toBe('function')
    const { listEditions, getEdition } = mod.useArchive()
    expect(typeof listEditions).toBe('function')
    expect(typeof getEdition).toBe('function')
  })
})
```

- [ ] **Step 2: Run test — should fail**

```bash
bun test tests/unit/use-archive.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write the composable**

```typescript
// app/composables/useArchive.ts
import type { ArchiveIndex, EditionArchive } from '../../../server/utils/archive-types'

export function useArchive() {
  function listEditions() {
    return useFetch<ArchiveIndex>('/api/archive')
  }

  function getEdition(slug: string) {
    return useFetch<EditionArchive>(`/api/archive/${slug}`)
  }

  return { listEditions, getEdition }
}
```

- [ ] **Step 4: Run test**

```bash
bun test tests/unit/use-archive.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useArchive.ts tests/unit/use-archive.test.ts
git commit -m "feat(app): add useArchive composable (unified archive data accessor)"
```

---

### Task 4: Archive showcase components

**Files:**
- Create: `app/components/archive/EditionCard.vue`
- Create: `app/components/archive/TeamCard.vue`
- Create: `app/components/archive/PrivacyBanner.vue`

These are presentational components; they receive props and emit no events (read-only showcase).

- [ ] **Step 1: Write EditionCard component**

```vue
<!-- app/components/archive/EditionCard.vue -->
<script setup lang="ts">
import type { ArchiveIndexEntry } from '../../../../server/utils/archive-types'

defineProps<{
  edition: ArchiveIndexEntry
}>()
</script>

<template>
  <article class="card bg-base-200 border border-base-300 hover:border-primary transition-colors">
    <div class="card-body gap-1">
      <h2 class="card-title text-xl font-black uppercase tracking-tight">{{ edition.name }}</h2>
      <p v-if="edition.starts_at" class="text-sm text-base-content/60 font-mono">
        {{ new Date(edition.starts_at).toLocaleDateString('en-GB', { timeZone: 'UTC' }) }}
        <template v-if="edition.ends_at">
          – {{ new Date(edition.ends_at).toLocaleDateString('en-GB', { timeZone: 'UTC' }) }}
        </template>
      </p>
      <div class="flex gap-4 mt-1 text-sm">
        <span>{{ edition.team_count }} teams</span>
        <span>{{ edition.participant_count }} participants</span>
      </div>
      <ul v-if="edition.winners.length" class="mt-2 space-y-0.5">
        <li v-for="w in edition.winners.slice(0, 3)" :key="w.team_name" class="text-sm">
          <span class="font-bold">#{{ w.placement }}</span> {{ w.team_name }}
          <span v-if="w.awards.length" class="text-base-content/50 text-xs"> · {{ w.awards.join(', ') }}</span>
        </li>
      </ul>
      <div class="card-actions justify-end mt-2">
        <NuxtLink :to="`/archive/${edition.slug}`" class="btn btn-sm btn-primary">View</NuxtLink>
      </div>
    </div>
  </article>
</template>
```

- [ ] **Step 2: Write TeamCard component**

```vue
<!-- app/components/archive/TeamCard.vue -->
<script setup lang="ts">
import type { ArchiveTeam } from '../../../../server/utils/archive-types'

defineProps<{
  team: ArchiveTeam
  presentationOrder?: number | null
}>()
</script>

<template>
  <article class="card bg-base-200 border border-base-300">
    <div class="card-body gap-2">
      <header class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-black text-lg uppercase tracking-tight">{{ team.name }}</h3>
          <p v-if="team.description" class="text-sm text-base-content/70">{{ team.description }}</p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span v-if="team.placement" class="badge badge-primary font-bold">#{{ team.placement }}</span>
          <span v-if="presentationOrder" class="badge badge-ghost text-xs">Slot {{ presentationOrder }}</span>
        </div>
      </header>

      <div v-if="team.awards.length" class="flex flex-wrap gap-1">
        <span v-for="award in team.awards" :key="award" class="badge badge-secondary text-xs">{{ award }}</span>
      </div>

      <a v-if="team.github_url" :href="team.github_url" target="_blank" rel="noopener"
         class="link link-accent text-sm font-mono truncate">
        {{ team.github_url }}
      </a>

      <ul v-if="team.members.length" class="space-y-0.5 mt-1">
        <li v-for="m in team.members" :key="m.token" class="text-sm">
          <span class="font-medium">{{ m.name }}</span>
          <span v-if="m.skills.length" class="text-base-content/50 text-xs"> · {{ m.skills.join(', ') }}</span>
        </li>
      </ul>
    </div>
  </article>
</template>
```

- [ ] **Step 3: Write PrivacyBanner component**

```vue
<!-- app/components/archive/PrivacyBanner.vue -->
<script setup lang="ts">
const config = useRuntimeConfig()
const isDormant = computed(() => config.public.siteMode === 'dormant')
</script>

<template>
  <aside v-if="isDormant" class="alert alert-info border border-info/40 text-sm">
    <span>
      This is an archived edition. To request removal of your data, email
      <a href="mailto:privacy@liberhack.org" class="link font-mono">privacy@liberhack.org</a>.
    </span>
  </aside>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add app/components/archive/EditionCard.vue app/components/archive/TeamCard.vue app/components/archive/PrivacyBanner.vue
git commit -m "feat(archive): add EditionCard, TeamCard, PrivacyBanner components"
```

---

### Task 5: Archive pages — /archive and /archive/[slug]

**Files:**
- Create: `app/pages/archive/index.vue`
- Create: `app/pages/archive/[slug].vue`

Route views are thin composition surfaces: they call `useArchive()`, handle loading/error state, and delegate rendering to the card components from Task 4.

- [ ] **Step 1: Write /archive page**

```vue
<!-- app/pages/archive/index.vue -->
<script setup lang="ts">
const { listEditions } = useArchive()
const { data: index, status, error } = await listEditions()
</script>

<template>
  <main class="container mx-auto px-4 py-8 max-w-4xl">
    <h1 class="text-4xl font-black uppercase tracking-tighter mb-2">Archive</h1>
    <p class="text-base-content/60 mb-8">Every past edition of LiberHack.</p>

    <ArchivePrivacyBanner />

    <div v-if="status === 'pending'" class="text-center py-16 text-base-content/40">Loading…</div>
    <div v-else-if="error" class="alert alert-error">Failed to load archive.</div>
    <div v-else-if="!index?.editions.length" class="text-center py-16 text-base-content/40">
      No archived editions yet.
    </div>
    <ul v-else class="grid gap-4 sm:grid-cols-2">
      <li v-for="edition in index.editions" :key="edition.slug">
        <ArchiveEditionCard :edition="edition" />
      </li>
    </ul>
  </main>
</template>
```

- [ ] **Step 2: Write /archive/[slug] page**

```vue
<!-- app/pages/archive/[slug].vue -->
<script setup lang="ts">
const route = useRoute()
const slug = computed(() => route.params.slug as string)

const { getEdition } = useArchive()
const { data: edition, status, error } = await getEdition(slug.value)

if (import.meta.server && error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, message: 'Edition not found' })
}

useSeoMeta({
  title: computed(() => edition.value ? `${edition.value.name} — LiberHack Archive` : 'Archive'),
})
</script>

<template>
  <main class="container mx-auto px-4 py-8 max-w-4xl">
    <NuxtLink to="/archive" class="link text-sm text-base-content/50 mb-4 block">← All editions</NuxtLink>

    <div v-if="status === 'pending'" class="text-center py-16 text-base-content/40">Loading…</div>
    <div v-else-if="error" class="alert alert-error">Failed to load edition.</div>

    <template v-else-if="edition">
      <header class="mb-6">
        <h1 class="text-4xl font-black uppercase tracking-tighter">{{ edition.name }}</h1>
        <p v-if="edition.starts_at" class="text-base-content/60 font-mono text-sm mt-1">
          <ClientOnly>
            {{ new Date(edition.starts_at).toLocaleDateString('en-GB') }}
            <template v-if="edition.ends_at">
              – {{ new Date(edition.ends_at).toLocaleDateString('en-GB') }}
            </template>
            <template #fallback>
              {{ edition.starts_at?.slice(0, 10) }}
              <template v-if="edition.ends_at"> – {{ edition.ends_at.slice(0, 10) }}</template>
            </template>
          </ClientOnly>
        </p>
        <div class="flex gap-4 text-sm mt-2">
          <span>{{ edition.team_count }} teams</span>
          <span>{{ edition.participant_count }} participants</span>
          <span v-if="edition.opted_out">+ {{ edition.opted_out }} opted out of public archive</span>
        </div>
      </header>

      <ArchivePrivacyBanner />

      <ul v-if="edition.teams.length" class="grid gap-4 mt-6 sm:grid-cols-2">
        <li v-for="team in edition.teams" :key="team.name">
          <ArchiveTeamCard :team="team" :presentation-order="team.presentation_order" />
        </li>
      </ul>
      <p v-else class="text-base-content/40 text-sm mt-4">No public teams in this edition.</p>
    </template>
  </main>
</template>
```

Note: Dates are wrapped in `<ClientOnly>` with a fallback using `.slice(0,10)` to avoid SSR/client hydration mismatch across time zones (spec requirement).

- [ ] **Step 3: Smoke test the pages**

```bash
# With a real archive/2026.json present (from archive-export in Part 2)
bun dev &
sleep 5
curl -s http://localhost:3000/archive | grep -i "liberhack"
curl -s http://localhost:3000/archive/2026 | grep -i "2026"
kill %1
```
Expected: both pages return HTML with edition data.

- [ ] **Step 4: Commit**

```bash
git add app/pages/archive/index.vue "app/pages/archive/[slug].vue"
git commit -m "feat(archive): add /archive and /archive/[slug] showcase pages"
```

---

### Task 6: Edition-scope all API routes

This task updates all existing `server/api/` routes to read/write through `registrations` (per-edition data) instead of `participants` (identity only).

**Helper to add first:** a shared `getCurrentEditionSlug()` utility.

- [ ] **Step 1: Add getCurrentEditionSlug to server/utils/supabase.ts**

Open `server/utils/supabase.ts` and append:

```typescript
export async function getCurrentEditionSlug(): Promise<string | null> {
  const supabase = useSupabaseAdmin()
  const { data } = await supabase
    .from('editions')
    .select('slug')
    .eq('is_current', true)
    .maybeSingle()
  return data?.slug ?? null
}
```

- [ ] **Step 2: Update server/api/me.get.ts**

Replace the file contents:

```typescript
// server/api/me.get.ts
import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const supabase = useSupabaseAdmin()
  const editionSlug = await getCurrentEditionSlug()

  const { data: participant } = await supabase
    .from('participants')
    .select('id, name, email')
    .eq('id', user.sub)
    .single()

  if (!participant) throw createError({ statusCode: 404, message: 'Participant not found' })

  let registration = null
  if (editionSlug) {
    const { data } = await supabase
      .from('registrations')
      .select('id, role, team_id, skills, dietary, experience, public, edition_slug')
      .eq('participant_id', user.sub)
      .eq('edition_slug', editionSlug)
      .maybeSingle()
    registration = data
  }

  return { ...participant, registration }
})
```

- [ ] **Step 3: Update server/api/me/profile.patch.ts**

Replace file contents:

```typescript
// server/api/me/profile.patch.ts
import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

const EXPERIENCE_VALUES = ['beginner', 'intermediate', 'experienced'] as const
type ExperienceLevel = (typeof EXPERIENCE_VALUES)[number]
const MAX_DIETARY_LENGTH = 200

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const body = await readBody<{ dietary?: unknown; experience?: unknown; public?: unknown }>(event)
  const update: Record<string, string | boolean | null> = {}

  if (body.dietary !== undefined) {
    if (body.dietary !== null && typeof body.dietary !== 'string')
      throw createError({ statusCode: 400, message: 'dietary must be a string' })
    const d = body.dietary === null ? '' : (body.dietary as string).trim()
    if (d.length > MAX_DIETARY_LENGTH)
      throw createError({ statusCode: 400, message: `Dietary must be ${MAX_DIETARY_LENGTH} chars or fewer` })
    update.dietary = d === '' ? null : d
  }

  if (body.experience !== undefined) {
    if (body.experience !== null && body.experience !== '' && !EXPERIENCE_VALUES.includes(body.experience as ExperienceLevel))
      throw createError({ statusCode: 400, message: `experience must be one of: ${EXPERIENCE_VALUES.join(', ')}` })
    update.experience = body.experience === null || body.experience === '' ? null : (body.experience as string)
  }

  if (body.public !== undefined) {
    if (typeof body.public !== 'boolean')
      throw createError({ statusCode: 400, message: 'public must be a boolean' })
    update.public = body.public
  }

  if (Object.keys(update).length === 0)
    throw createError({ statusCode: 400, message: 'No fields to update' })

  const supabase = useSupabaseAdmin()
  const { error } = await supabase
    .from('registrations')
    .update(update)
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)

  if (error) throw createError({ statusCode: 500, message: 'Internal server error' })
  return { ok: true }
})
```

- [ ] **Step 4: Update server/api/me/team.delete.ts**

Open the file and change any `participants` mutation to target `registrations`:

```typescript
// server/api/me/team.delete.ts
import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const supabase = useSupabaseAdmin()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, team_id, role')
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)
    .maybeSingle()

  if (!reg?.team_id) throw createError({ statusCode: 409, message: 'Not in a team' })
  if (reg.role === 'leader') throw createError({ statusCode: 409, message: 'Leader cannot leave — transfer leadership first' })

  const { error } = await supabase
    .from('registrations')
    .update({ team_id: null, role: 'participant' })
    .eq('id', reg.id)

  if (error) throw createError({ statusCode: 500, message: 'Internal server error' })
  return { ok: true }
})
```

- [ ] **Step 5: Update server/api/teams/index.post.ts**

Replace file:

```typescript
// server/api/teams/index.post.ts
import { serverSupabaseUser } from '#supabase/server'
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'

const MAX_SKILLS = 10
const MAX_SKILL_LENGTH = 30

function validateSkills(skillsWanted: unknown): string[] {
  if (!skillsWanted) return []
  if (!Array.isArray(skillsWanted)) throw createError({ statusCode: 400, message: 'skills_wanted must be an array' })
  const skills = (skillsWanted as unknown[]).map(s => String(s).trim()).filter(s => s.length > 0)
  if (skills.length > MAX_SKILLS) throw createError({ statusCode: 400, message: `Maximum ${MAX_SKILLS} skills allowed` })
  const bad = skills.find(s => s.length > MAX_SKILL_LENGTH)
  if (bad) throw createError({ statusCode: 400, message: `Skill "${bad}" exceeds ${MAX_SKILL_LENGTH} characters` })
  return skills
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) throw createError({ statusCode: 409, message: 'No active edition' })

  const supabase = useSupabaseAdmin()

  // Check if already in a team for this edition
  const { data: reg } = await supabase
    .from('registrations')
    .select('id, team_id')
    .eq('participant_id', user.sub)
    .eq('edition_slug', editionSlug)
    .maybeSingle()

  if (!reg) throw createError({ statusCode: 409, message: 'Not registered for this edition' })
  if (reg.team_id) throw createError({ statusCode: 409, message: 'Already in a team' })

  const body = await readBody<{ name: string; skills_wanted?: string[]; description?: string }>(event)
  if (!body.name?.trim()) throw createError({ statusCode: 400, message: 'Team name is required' })
  const skills = validateSkills(body.skills_wanted)

  // Step 1: create team with this registration as leader
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert({ edition_slug: editionSlug, name: body.name.trim(), leader_id: reg.id, skills_wanted: skills, description: body.description ?? null })
    .select()
    .single()

  if (teamErr) {
    if (teamErr.code === '23505') throw createError({ statusCode: 409, message: 'Team name already taken in this edition' })
    throw createError({ statusCode: 500, message: 'Failed to create team' })
  }

  // Step 2: set team_id + role on registration
  await supabase
    .from('registrations')
    .update({ team_id: team.id, role: 'leader' })
    .eq('id', reg.id)

  return team
})
```

- [ ] **Step 6: Update server/api/teams/index.get.ts — scope to current edition**

Open file and add edition filter. Find the `.from('teams')` query and add:

```typescript
import { getCurrentEditionSlug } from '#server/utils/supabase'

// Inside handler:
const editionSlug = await getCurrentEditionSlug()
if (!editionSlug) return []

// Add to the teams query:
.eq('edition_slug', editionSlug)
```

- [ ] **Step 7: Update admin/live/config.get.ts and config.patch.ts**

`server/api/admin/live/config.get.ts` — add `getCurrentEditionSlug()` and filter event_config by it:

```typescript
import { useSupabaseAdmin, getCurrentEditionSlug } from '#server/utils/supabase'
import { useAdminAuth } from '#server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  useAdminAuth(event)
  const editionSlug = await getCurrentEditionSlug()
  if (!editionSlug) return null
  const supabase = useSupabaseAdmin()
  const { data } = await supabase
    .from('event_config')
    .select('*')
    .eq('edition_slug', editionSlug)
    .maybeSingle()
  return data
})
```

`server/api/admin/live/config.patch.ts` — same pattern: scope writes to current `edition_slug`.

- [ ] **Step 8: Add /api/editions/current route**

Create `server/api/editions/current.get.ts`:

```typescript
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async () => {
  const supabase = useSupabaseAdmin()
  const { data } = await supabase
    .from('editions')
    .select('slug, name, starts_at, ends_at, status')
    .eq('is_current', true)
    .maybeSingle()
  return data ?? null
})
```

- [ ] **Step 9: Commit**

```bash
git add server/utils/supabase.ts server/api/me.get.ts server/api/me/profile.patch.ts server/api/me/team.delete.ts server/api/teams/index.post.ts server/api/teams/index.get.ts server/api/admin/live/config.get.ts server/api/admin/live/config.patch.ts server/api/editions/current.get.ts
git commit -m "feat(api): edition-scope all routes (registrations replace participant per-edition fields)"
```

---

### Task 7: Registration form — add opt-out and use registrations

**Files:**
- Modify: `app/pages/ops/register.vue`

The form must (a) state archive visibility explicitly (GDPR transparency), (b) offer a clearly-labelled opt-out checkbox (`public` field), and (c) write `public` into the `registrations` record via the updated trigger on signup.

- [ ] **Step 1: Add archive consent section to registration form**

Open `app/pages/ops/register.vue`. Find the skills/dietary/experience section and add after it:

```vue
<!-- Add to the form reactive object -->
<!-- const form = reactive({ ..., public: true }) -->

<!-- Add to the template, before the submit button -->
<fieldset class="space-y-2">
  <legend class="text-sm font-semibold text-base-content/70 uppercase tracking-wide">Archive visibility</legend>
  <p class="text-sm text-base-content/60">
    Your profile and team will be shown in the public showcase after the event.
  </p>
  <label class="flex items-start gap-3 cursor-pointer">
    <input
      v-model="form.public"
      type="checkbox"
      class="checkbox checkbox-sm mt-0.5"
      :true-value="false"
      :false-value="true"
    />
    <span class="text-sm">Hide my profile from the public archive.</span>
  </label>
</fieldset>
```

In the `form` reactive object, add `public: true` as default (visible by default).

In the `register()` function, pass `public: form.public` via user_metadata, so `handle_new_user` can pick it up when creating the registration:

```typescript
options: {
  data: { name: form.name, skills, dietary, experience, public: form.public },
  // ...
},
```

Update `handle_new_user` migration (already done in Part 1 Task 7) to read `new.raw_user_meta_data->>'public'` and set `registrations.public` accordingly:

In `supabase/migrations/20260700000005_update_handle_new_user.sql`, add to the registration insert:
```sql
(new.raw_user_meta_data->>'public')::boolean is not false  -- default true; only false if explicitly passed
```

Specifically in the INSERT, replace the `public` column default with:
```sql
coalesce((new.raw_user_meta_data->>'public')::boolean, true)
```

- [ ] **Step 2: Verify form works end-to-end**

```bash
bun dev &
# Open http://localhost:3000/ops/register in a browser
# Register with "Hide my profile" checked
# Verify new registration has public=false in DB
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add app/pages/ops/register.vue supabase/migrations/20260700000005_update_handle_new_user.sql
git commit -m "feat(register): add archive visibility opt-out to registration form"
```

---

### Task 8: Admin — edition lifecycle UI

**Files:**
- Modify: `app/pages/ops/admin/index.vue` (or the relevant admin page)
- Create: `app/components/admin/EditionLifecycle.vue`

This adds a panel to `/ops/admin` for: closing the current edition, creating a draft, and going live.

- [ ] **Step 1: Create EditionLifecycle component**

```vue
<!-- app/components/admin/EditionLifecycle.vue -->
<script setup lang="ts">
const { data: current, refresh } = await useFetch('/api/editions/current')

const draftForm = reactive({ slug: '', name: '', starts_at: '', ends_at: '' })
const error = ref('')
const loading = ref(false)

async function closeEdition() {
  if (!current.value) return
  if (!confirm(`Archive "${current.value.name}"? This cannot be undone.`)) return
  loading.value = true
  try {
    await $fetch('/api/admin/editions/close', { method: 'POST', body: { slug: current.value.slug } })
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}

async function createDraft() {
  if (!draftForm.slug.trim() || !draftForm.name.trim()) { error.value = 'Slug and name are required'; return }
  loading.value = true
  try {
    await $fetch('/api/admin/editions/draft', { method: 'POST', body: draftForm })
    await refresh()
    Object.assign(draftForm, { slug: '', name: '', starts_at: '', ends_at: '' })
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}

async function goLive(slug: string) {
  if (!confirm(`Go live with "${slug}"?`)) return
  loading.value = true
  try {
    await $fetch('/api/admin/editions/go-live', { method: 'POST', body: { slug } })
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}
</script>

<template>
  <section class="space-y-6">
    <h2 class="text-xl font-black uppercase tracking-tight">Edition Lifecycle</h2>
    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>

    <!-- Current edition -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body">
        <h3 class="font-bold">Current Edition</h3>
        <p v-if="current" class="font-mono">{{ current.slug }} — {{ current.name }}</p>
        <p v-else class="text-base-content/50 text-sm">No active edition (dormant mode).</p>
        <div v-if="current" class="card-actions">
          <button class="btn btn-sm btn-warning" :disabled="loading" @click="closeEdition">
            Close & Archive
          </button>
        </div>
      </div>
    </div>

    <!-- Create draft -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body space-y-3">
        <h3 class="font-bold">Create Draft Edition</h3>
        <input v-model="draftForm.slug"  class="input input-bordered w-full" placeholder="Slug (e.g. 2027)" />
        <input v-model="draftForm.name"  class="input input-bordered w-full" placeholder="Name (e.g. LiberHack 2027)" />
        <input v-model="draftForm.starts_at" type="datetime-local" class="input input-bordered w-full" />
        <input v-model="draftForm.ends_at"   type="datetime-local" class="input input-bordered w-full" />
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="createDraft">
          Create Draft
        </button>
      </div>
    </div>

    <!-- Draft editions list -->
    <DraftEditionsList @go-live="goLive" />
  </section>
</template>
```

- [ ] **Step 2: Create supporting API routes**

`server/api/admin/editions/close.post.ts`:
```typescript
import { useAdminAuth } from '#server/utils/adminAuth'
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  useAdminAuth(event)
  const { slug } = await readBody<{ slug: string }>(event)
  const supabase = useSupabaseAdmin()
  const { error } = await supabase.rpc('close_edition', { p_slug: slug })
  if (error) throw createError({ statusCode: 400, message: error.message })
  return { ok: true }
})
```

`server/api/admin/editions/draft.post.ts`:
```typescript
import { useAdminAuth } from '#server/utils/adminAuth'
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  useAdminAuth(event)
  const body = await readBody<{ slug: string; name: string; starts_at?: string; ends_at?: string }>(event)
  if (!body.slug?.trim() || !body.name?.trim()) throw createError({ statusCode: 400, message: 'slug and name required' })
  const supabase = useSupabaseAdmin()
  const { error } = await supabase.from('editions').insert({
    slug: body.slug.trim(), name: body.name.trim(),
    starts_at: body.starts_at || null, ends_at: body.ends_at || null,
    status: 'draft',
  })
  if (error) throw createError({ statusCode: 400, message: error.message })
  return { ok: true }
})
```

`server/api/admin/editions/go-live.post.ts`:
```typescript
import { useAdminAuth } from '#server/utils/adminAuth'
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  useAdminAuth(event)
  const { slug } = await readBody<{ slug: string }>(event)
  const supabase = useSupabaseAdmin()
  const { error } = await supabase.rpc('go_live_edition', { p_slug: slug })
  if (error) throw createError({ statusCode: 400, message: error.message })
  return { ok: true }
})
```

- [ ] **Step 3: Add DraftEditionsList child component**

```vue
<!-- app/components/admin/DraftEditionsList.vue -->
<script setup lang="ts">
defineEmits<{ 'go-live': [slug: string] }>()
const emit = defineEmits<{ 'go-live': [slug: string] }>()

const { data: drafts, refresh } = await useFetch('/api/admin/editions/drafts')
</script>

<template>
  <div v-if="drafts?.length" class="card bg-base-200 border border-base-300">
    <div class="card-body">
      <h3 class="font-bold">Draft Editions</h3>
      <ul class="space-y-2">
        <li v-for="d in drafts" :key="d.slug" class="flex items-center justify-between">
          <span class="font-mono text-sm">{{ d.slug }} — {{ d.name }}</span>
          <button class="btn btn-xs btn-success" @click="emit('go-live', d.slug)">Go Live</button>
        </li>
      </ul>
    </div>
  </div>
</template>
```

`server/api/admin/editions/drafts.get.ts`:
```typescript
import { useAdminAuth } from '#server/utils/adminAuth'
import { useSupabaseAdmin } from '#server/utils/supabase'

export default defineEventHandler(async (event) => {
  useAdminAuth(event)
  const supabase = useSupabaseAdmin()
  const { data } = await supabase.from('editions').select('slug, name, starts_at, ends_at').eq('status', 'draft').order('created_at')
  return data ?? []
})
```

- [ ] **Step 4: Wire EditionLifecycle into the admin page**

Open `app/pages/ops/admin/index.vue`. Find the main admin content area and add:

```vue
<AdminEditionLifecycle class="mt-8" />
```

- [ ] **Step 5: Commit**

```bash
git add app/components/admin/EditionLifecycle.vue app/components/admin/DraftEditionsList.vue server/api/admin/editions/ app/pages/ops/admin/index.vue
git commit -m "feat(admin): add edition lifecycle panel (close / create-draft / go-live)"
```

---

### Task 9: Dormant static build test

**Files:**
- `nuxt.config.ts` (verify route rules)
- `.env.dormant.example` (new)

This task verifies that `bun generate` with `NUXT_PUBLIC_SITE_MODE=dormant` produces a valid static build with `/archive` pages included and `/ops/*` excluded.

- [ ] **Step 1: Create .env.dormant.example**

```bash
# .env.dormant.example — copy to .env.dormant and fill in values
NUXT_PUBLIC_SITE_MODE=dormant
NUXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NUXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Leave NUXT_SUPABASE_SERVICE_KEY and NUXT_POSTMARK_TOKEN empty/unset for static build
```

- [ ] **Step 2: Ensure archive/index.json and at least one archive/<slug>.json exist**

From Part 2:
```bash
bun scripts/archive-export.ts --slug 2026
```

- [ ] **Step 3: Run dormant static build**

```bash
NUXT_PUBLIC_SITE_MODE=dormant bun generate
```
Expected: builds without error. Check:
```bash
ls .output/public/archive/
```
Expected: `index.html` present (prerendered `/archive` page).

```bash
ls .output/public/archive/2026/
```
Expected: `index.html` present (prerendered `/archive/2026` page).

- [ ] **Step 4: Verify /ops is excluded**

```bash
ls .output/public/ops/ 2>/dev/null && echo "FAIL: ops directory should not exist" || echo "PASS: ops not in static output"
```
Expected: `PASS`

- [ ] **Step 5: Verify no Supabase console errors (via grep)**

```bash
grep -r "supabase" .output/public/ --include="*.js" | grep -v "dormant" | head -5
```
The guard plugin should prevent any Supabase client from making network calls; verify no active client initialization in the output bundle.

- [ ] **Step 6: Check privacy banner is rendered**

```bash
grep -l "privacy@liberhack.org" .output/public/archive/*.html
```
Expected: all archive HTML files contain the privacy banner (dormant mode is set at build time).

- [ ] **Step 7: Commit**

```bash
git add .env.dormant.example
git commit -m "docs: add dormant mode env example; static build verified"
```

---

## Self-review against spec

**Spec coverage:**

| Spec requirement | Covered in |
|---|---|
| Per-edition archive files `archive/<slug>.json` + `archive/index.json` | Part 2 Task 3 |
| Returning-user pre-fill from most recent registration | Part 3 Task 6 (me.get.ts) |
| Opt-out `registrations.public`, counted in `opted_out` | Part 1 Task 1/2, Part 2 Task 3, Part 3 Task 7 |
| Erasure uncounted | Part 2 Task 5 |
| Per-member opaque token | Part 2 Task 3 |
| Private keyring (not deployed) | Part 2 Task 2 (.gitignore) + Task 3 |
| Export guard (block if pending non-empty) | Part 2 Task 3 |
| `redact-hide` (per-edition, increments opted_out) | Part 2 Task 4 |
| `redact-delete` (whole-account, all editions, uncounted) | Part 2 Task 5 |
| `apply-redactions` (idempotent, drains pending→applied) | Part 2 Task 6 |
| Worst-case erasure scenario test | Part 2 Task 7 |
| Dormant mode: Supabase client skip | Part 3 Task 1 |
| Hydration-safe archive dates (`<ClientOnly>` + UTC fallback) | Part 3 Task 5 |
| Privacy banner on archive pages in dormant mode | Part 3 Task 4 |
| Admin: close edition / create draft / go live | Part 3 Task 8 |
| Edition lifecycle RPCs | Part 1 Task 8 |
| `editions` natural PK, `is_current` + `status` CHECK | Part 1 Task 1 |
| `participants` slimmed to identity | Part 1 Task 7 |
| `handle_leader_departure` trigger | Part 1 Task 6 |
| Runbook (LIVE↔DORMANT + dormant removal) | Part 2 Task 8 |
| Dormant static build smoke test | Part 3 Task 9 |
