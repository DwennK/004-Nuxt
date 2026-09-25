import { requireActiveSessionUser } from '~~/server/utils/auth/session'
import { lookupSmartphoneImei } from '~~/server/utils/imei-lookup'
import { smartphoneImeiLookupSchema } from '~~/shared/validation/smartphones'

export default eventHandler(async (event) => {
  await requireActiveSessionUser(event)
  const { imei } = await readValidatedBody(event, smartphoneImeiLookupSchema.parse)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return lookupSmartphoneImei(imei, useTursoClient())
})
