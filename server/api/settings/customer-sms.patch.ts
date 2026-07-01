import { customerSmsSettingsInputSchema } from '~~/shared/validation/settings'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { updateCustomerSmsSettings } from '~~/server/utils/customer-sms-settings'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const body = await readValidatedBody(event, customerSmsSettingsInputSchema.parse)
  return updateCustomerSmsSettings(body)
})
