import { createAssistantStream } from '~~/server/utils/assistant/stream'
import { runAssistantChat } from '~~/server/utils/assistant/chat'
import { assistantSqlDebugRequiresAdmin } from '~~/server/utils/assistant/policy'
import { getUseCaseContext, requireCapability } from '~~/server/utils/auth/session'
import { assistantChatRequestSchema } from '~~/shared/validation/assistant'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, assistantChatRequestSchema.parse)

  if (assistantSqlDebugRequiresAdmin(body.debug)) {
    await requireCapability(event, 'administration:manage')
  }

  const { requestId } = getUseCaseContext(event)
  if (!getHeader(event, 'accept')?.includes('text/event-stream')) {
    return runAssistantChat(event, body.messages, body.debug, requestId)
  }
  const stream = createAssistantStream(
    options => runAssistantChat(event, body.messages, body.debug, requestId, options),
    event.web?.request?.signal
  )
  // Node dev uses a ServerResponse; Worker cancellation propagates through the Web stream.
  event.node.res.once('close', stream.abort)
  return new Response(stream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
})
