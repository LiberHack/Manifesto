import { fetchLiveData, addLiveController, removeLiveController } from '#server/utils/liveStream'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  const stream = new ReadableStream({
    async start(controller) {
      addLiveController(controller)

      // Send initial payload on connect
      const data = await fetchLiveData()
      const message = `data: ${JSON.stringify(data)}\n\n`
      controller.enqueue(new TextEncoder().encode(message))

      // Clean up on client disconnect
      event.node.req.on('close', () => {
        removeLiveController(controller)
      })
    },
  })

  return sendStream(event, stream)
})
