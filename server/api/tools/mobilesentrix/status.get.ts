import { getMobileSentrixStatus } from '~~/server/utils/mobilesentrix'

export default eventHandler((event) => {
  const requestUrl = getRequestURL(event)

  return getMobileSentrixStatus(requestUrl.origin)
})
