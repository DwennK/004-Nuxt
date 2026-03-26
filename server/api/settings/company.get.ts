import { getCompanySettings } from '~~/server/utils/company-settings'

export default eventHandler(async () => {
  return getCompanySettings()
})
