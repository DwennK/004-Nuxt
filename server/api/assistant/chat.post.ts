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
  return runAssistantChat(event, body.messages, body.debug, requestId)
})
