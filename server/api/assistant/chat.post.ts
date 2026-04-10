import { runAssistantChat } from '~~/server/utils/assistant/chat'
import { assistantChatRequestSchema } from '~~/shared/validation/assistant'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, assistantChatRequestSchema.parse)
  return runAssistantChat(body.messages, body.debug)
})
