import { getMobileSentrixAuthorizeUrl } from '~~/server/utils/mobilesentrix'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const requestUrl = getRequestURL(event)

  return sendRedirect(event, getMobileSentrixAuthorizeUrl(requestUrl.origin))
})
