// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-charts',
    '@vueuse/nuxt',
    'nitro-cloudflare-dev',
    'nuxt-auth-utils'
  ],
  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    tursoUrl: process.env.TURSO_URL,
    tursoToken: process.env.TURSO_TOKEN,
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxModel: process.env.MINIMAX_MODEL,
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM,
    mailReplyTo: process.env.MAIL_REPLY_TO
  },

  compatibilityDate: '2026-03-10',

  nitro: {
    preset: 'cloudflare_module',

    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
