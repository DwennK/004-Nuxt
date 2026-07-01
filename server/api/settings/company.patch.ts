import { updateCompanySettings } from '~~/server/utils/company-settings'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { companySettingsInputSchema } from '~~/shared/validation/settings'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const body = await readValidatedBody(event, companySettingsInputSchema.parse)
  return updateCompanySettings(body)
})
