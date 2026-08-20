import { z } from 'zod'
import { logTicketSmsQrOpened } from '~~/server/utils/customer-sms-settings'
import { numericIdParamsSchema } from '~~/shared/validation/api'

const bodySchema = z.object({
  templateId: z.string().trim().min(1).nullable(),
  templateLabel: z.string().trim().min(1),
  mode: z.enum(['template', 'free'])
})

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  await logTicketSmsQrOpened(params.id, body)

  return {
    ok: true
  }
})
