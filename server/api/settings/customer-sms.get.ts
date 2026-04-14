import { getCustomerSmsSettings } from '~~/server/utils/customer-sms-settings'

export default eventHandler(async () => {
  return getCustomerSmsSettings()
})
