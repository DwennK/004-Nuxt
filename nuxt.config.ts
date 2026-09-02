const isProduction = process.env.NODE_ENV === 'production'
const turnstileTestSiteKey = '1x00000000000000000000AA'
const turnstileTestSecretKey = '1x0000000000000000000000000000000AA'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
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
    posAllowRuntimeSchemaBootstrap: process.env.POS_ALLOW_RUNTIME_SCHEMA_BOOTSTRAP === 'true',
    posAllowRuntimeDemoSeed: process.env.POS_ALLOW_RUNTIME_DEMO_SEED === 'true',
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxModel: process.env.MINIMAX_MODEL,
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM,
    mailReplyTo: process.env.MAIL_REPLY_TO,
    shopifyShopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
    shopifyClientId: process.env.SHOPIFY_CLIENT_ID,
    shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    shopifyAdminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    mobilesentrixBaseUrl: process.env.MOBILESENTRIX_BASE_URL,
    mobilesentrixConsumerName: process.env.MOBILESENTRIX_CONSUMER_NAME,
    mobilesentrixConsumerKey: process.env.MOBILESENTRIX_CONSUMER_KEY,
    mobilesentrixConsumerSecret: process.env.MOBILESENTRIX_CONSUMER_SECRET,
    mobilesentrixAccessToken: process.env.MOBILESENTRIX_ACCESS_TOKEN,
    mobilesentrixAccessTokenSecret: process.env.MOBILESENTRIX_ACCESS_TOKEN_SECRET,
    mobilesentrixRestAuthHeaderName: process.env.MOBILESENTRIX_REST_AUTH_HEADER_NAME,
    mobilesentrixRestAuthHeaderValue: process.env.MOBILESENTRIX_REST_AUTH_HEADER_VALUE,
    turnstileSecretKey: process.env.NUXT_TURNSTILE_SECRET_KEY
      || (isProduction ? '' : turnstileTestSecretKey),
    public: {
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY
        || (isProduction ? '' : turnstileTestSiteKey)
    }
  },

  sourcemap: {
    client: false,
    server: false
  },

  compatibilityDate: '2026-03-10',

  nitro: {
    preset: 'cloudflare_module',
    sourceMap: false,

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
  },

  icon: {
    serverBundle: {
      collections: ['lucide']
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 256
    }
  }
})
