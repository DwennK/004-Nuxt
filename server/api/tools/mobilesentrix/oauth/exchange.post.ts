import { exchangeMobileSentrixOAuthToken } from '~~/server/utils/mobilesentrix'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { mobileSentrixOAuthExchangeSchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const body = await readValidatedBody(event, mobileSentrixOAuthExchangeSchema.parse)

  return exchangeMobileSentrixOAuthToken(body.oauthToken, body.oauthVerifier)
})
