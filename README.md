# 004-Nuxt

Nuxt 4 dashboard app based on Nuxt UI, configured for deployment on Cloudflare Workers.

## Stack

- Nuxt 4
- Nuxt UI
- npm
- Cloudflare Workers via Nitro
- Turso-ready environment variables

## Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

## Environment Variables

Defined in [.env.example](./.env.example):

```bash
NUXT_PUBLIC_SITE_URL=
TURSO_URL=
TURSO_TOKEN=
```

- `NUXT_PUBLIC_SITE_URL`: public site URL
- `TURSO_URL`: Turso database URL
- `TURSO_TOKEN`: Turso auth token

## Development

Start the Nuxt dev server:

```bash
npm run dev
```

Use `npm run dev` for day-to-day development:

- fast feedback loop
- hot reload
- best choice while building features

## Cloudflare Workers

This project uses the Nitro `cloudflare_module` preset configured in [nuxt.config.ts](./nuxt.config.ts).

Build for production:

```bash
npm run build
```

Preview the Worker locally with Wrangler:

```bash
npm run preview
```

Use `npm run preview` when you want to validate the Cloudflare runtime locally:

- runs a production build first
- starts the app with Wrangler
- closer to real Cloudflare Workers behavior than `npm run dev`
- slower than the regular dev server, so it is not the default coding workflow

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

Generate Cloudflare runtime types:

```bash
npm run cf-typegen
```

## Deployment Notes

- Deploy using the generated Nitro output, not `wrangler deploy` at the repo root.
- The deploy script already uses the correct command: `wrangler --cwd .output deploy`.
- For GitHub-based deployments, make sure Cloudflare uses the Workers/Nitro workflow rather than a static Pages setup.
