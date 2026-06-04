// Module-level set of active SSE controllers
const controllers = new Set<ReadableStreamDefaultController>()

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

// Broadcast fresh data to all connected SSE clients
export async function broadcastLive() {
  if (controllers.size === 0) return

  const data = await fetchLiveData()
  const message = `data: ${JSON.stringify(data)}\n\n`
  const encoded = new TextEncoder().encode(message)

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded)
    } catch {
      // Controller is closed — remove it
      controllers.delete(controller)
    }
  }
}

// Add a controller to the active set
export function addLiveController(controller: ReadableStreamDefaultController) {
  controllers.add(controller)
}

// Remove a controller from the active set
export function removeLiveController(controller: ReadableStreamDefaultController) {
  controllers.delete(controller)
  try { controller.close() } catch { /* already closed */ }
}
