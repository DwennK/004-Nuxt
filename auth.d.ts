declare module '#auth-utils' {
  interface User {
    id: number
    email: string
    name: string
    isAdmin: boolean
  }

  interface UserSession {
    user: User
  }
}

declare module 'nuxt/schema' {
  interface PageMeta {
    auth?: boolean
  }
}

export {}
