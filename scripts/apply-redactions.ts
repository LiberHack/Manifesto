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
      } else {
        // delete mode: remove the auth account entirely
        let authId = entry.who
        if (entry.who.includes('@')) {
          const { data: p } = await db
            .from('participants')
            .select('id')
            .eq('email', entry.who)
            .maybeSingle()
          if (p) authId = p.id
        }

        const { error } = await (db.auth.admin as { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> }).deleteUser(authId)
        if (error && !error.message.includes('not found') && !error.message.includes('User not found')) {
          throw error
        }
      }
      applied.push(entry)
    } catch (err) {
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
