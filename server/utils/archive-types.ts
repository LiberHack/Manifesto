export interface ArchiveMember {
  token: string
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
  participant_count: number
  team_count: number
  opted_out: number
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
  token: string
  who: string
}

export interface DeleteEntry {
  mode: 'delete'
  who: string
}

export type RedactionEntry = HideEntry | DeleteEntry

export interface KeyringOccurrence {
  edition_slug: string
  token: string
}

export interface KeyringEntry {
  who: string
  email: string
  occurrences: KeyringOccurrence[]
}

export type Keyring = KeyringEntry[]
