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
    modifiedFiles.set(occ.edition_slug, archive)
  }

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as ArchiveIndex

  for (const [slug, archive] of modifiedFiles) {
    writeFileSync(join(ROOT, `archive/${slug}.json`), JSON.stringify(archive, null, 2))
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
