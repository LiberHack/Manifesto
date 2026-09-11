// Interval between Supabase polls per open SSE connection. Workers isolates do not
// share memory, so admin writes cannot push to connected clients; each stream polls
// instead and only forwards a payload when the content actually changed.
export const LIVE_POLL_MS = 5_000

// Fetch current live data snapshot from Supabase
export async function fetchLiveData() {
  const supabase = useSupabaseAdmin()

  const [configRes, scheduleRes, announcementsRes] = await Promise.all([
    supabase.from('event_config').select('*').eq('id', 1).single(),
    supabase.from('schedule_items').select('*').order('sort_order'),
    supabase.from('announcements').select('*').order('sort_order'),
  ])

  return {
    config: configRes.data,
    schedule: scheduleRes.data ?? [],
    announcements: announcementsRes.data ?? [],
    serverTime: new Date().toISOString(),
  }
}

// Stable fingerprint of the parts that matter for change detection (serverTime excluded)
export function liveFingerprint(data: Awaited<ReturnType<typeof fetchLiveData>>): string {
  return JSON.stringify([data.config, data.schedule, data.announcements])
}
