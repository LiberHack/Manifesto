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
