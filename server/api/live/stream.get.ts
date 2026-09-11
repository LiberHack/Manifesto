import { fetchLiveData, liveFingerprint, LIVE_POLL_MS } from '#server/utils/liveStream'

const encoder = new TextEncoder()

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      let last = ''

      const push = async () => {
        if (closed) return
        try {
          const data = await fetchLiveData()
          const fingerprint = liveFingerprint(data)
          // Always send the first frame; afterwards only on change
          if (last === '' || fingerprint !== last) {
            last = fingerprint
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } else {
            controller.enqueue(encoder.encode(': keep-alive\n\n'))
          }
        } catch (error) {
          console.error('[live] poll failed', error)
        }
        if (!closed) timer = setTimeout(push, LIVE_POLL_MS)
      }

      await push()
    },
    // Invoked by the runtime when the client disconnects
    cancel() {
      closed = true
      if (timer) clearTimeout(timer)
    },
  })

  return sendStream(event, stream)
})
