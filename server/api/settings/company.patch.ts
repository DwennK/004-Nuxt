import { updateCompanySettings } from '~~/server/utils/company-settings'
import { companySettingsInputSchema } from '~~/shared/validation/settings'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, companySettingsInputSchema.parse)
  return updateCompanySettings(body)
})
