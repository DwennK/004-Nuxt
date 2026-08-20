import type { AuthRequestContext } from '../utils/auth/session'

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthRequestContext
    requestId?: string
  }
}

export {}
