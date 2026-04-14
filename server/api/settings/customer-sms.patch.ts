import { customerSmsSettingsInputSchema } from '~~/shared/validation/settings'
import { updateCustomerSmsSettings } from '~~/server/utils/customer-sms-settings'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, customerSmsSettingsInputSchema.parse)
  return updateCustomerSmsSettings(body)
})
