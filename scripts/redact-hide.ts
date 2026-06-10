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
