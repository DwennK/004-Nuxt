import { z } from 'zod'
import { getMobileSentrixBrowserExchangeHtml } from '~~/server/utils/mobilesentrix'

const querySchema = z.object({
  oauthToken: z.string().trim().min(1),
  oauthVerifier: z.string().trim().min(1)
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')

  return getMobileSentrixBrowserExchangeHtml(query.oauthToken, query.oauthVerifier)
})
