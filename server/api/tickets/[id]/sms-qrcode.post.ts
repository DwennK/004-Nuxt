import { z } from 'zod'
import { logTicketSmsQrOpened } from '~~/server/utils/customer-sms-settings'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

const bodySchema = z.object({
  templateId: z.string().trim().min(1).nullable(),
  templateLabel: z.string().trim().min(1),
  mode: z.enum(['template', 'free'])
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, bodySchema.parse)

  await logTicketSmsQrOpened(params.id, body)

  return {
    ok: true
  }
})
