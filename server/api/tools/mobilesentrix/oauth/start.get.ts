import { getMobileSentrixAuthorizeUrl } from '~~/server/utils/mobilesentrix'

export default eventHandler((event) => {
  const requestUrl = getRequestURL(event)

  return sendRedirect(event, getMobileSentrixAuthorizeUrl(requestUrl.origin))
})
