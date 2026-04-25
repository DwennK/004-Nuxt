import { exchangeMobileSentrixOAuthToken } from '~~/server/utils/mobilesentrix'
import { mobileSentrixOAuthExchangeSchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, mobileSentrixOAuthExchangeSchema.parse)

  return exchangeMobileSentrixOAuthToken(body.oauthToken, body.oauthVerifier)
})
