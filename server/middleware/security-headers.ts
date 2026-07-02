// En-têtes de sécurité appliqués à toutes les réponses.
// La CSP et HSTS ne sont posées qu'en production pour ne pas gêner le HMR/devtools.
const PRODUCTION_CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `img-src 'self' data: blob:`,
  `media-src 'self' blob:`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'`,
  `connect-src 'self'`
].join('; ')

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()'
  })

  if (!import.meta.dev) {
    setResponseHeaders(event, {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': PRODUCTION_CSP
    })
  }
})
