# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Lines of Code](https://img.shields.io/endpoint?url=https://ghloc.vercel.app/api/dwennk/004-nuxt/badge)](https://ghloc.vercel.app/github/dwennk/004-nuxt)

Nuxt 4 POS and shop-management app for a physical tech store.

The app is built for day-to-day in-store operations with a strict business split between:

- `ticket`: operational work case such as repair, diagnostic, support or tracked follow-up
- `document`: commercial object such as quote, customer order or invoice
- `payment`: cashflow object tracked separately from tickets and documents

The app uses Nuxt server routes, Drizzle ORM and Turso/libSQL, and is deployed through Nitro to Cloudflare Workers.

## Product Scope

Current core scope:

- customers
- catalog
- direct sales
- repair / support tickets
- commercial documents
- payments
- reports
- company settings

Secondary business modules:

- smartphone stock
- smartphone reservations
- vacation tracking
- sent e-mails viewer
- WooCommerce order import
- customer SMS settings / QR flows
- internal AI assistant

Still scaffold / secondary in the repo:

- notifications
- generic security/settings pages
- some dashboard-template leftovers

## Main Workflows

Typical business flows:

- tracked repair: `Ticket -> Quote -> Invoice -> Payment -> Ticket closed`
- customer order: `Ticket or direct context -> Customer order -> Invoice -> Payment`
- direct sale: `Quick sale -> Invoice -> Payment`
- quick support: `Invoice -> Payment`
- WooCommerce import: `Woo order -> POS invoice -> manual payment reconciliation`

Important product rules:

- money is stored as integer cents
- pricing is TTC / VAT-inclusive
- VAT exists both on lines and documents
- document line quantity is stored as an integer
- ticket and document numbers are generated server-side
- direct sales can happen without a ticket
- payments are tracked separately from documents

## Stack

- `Nuxt 4`
- `Vue 3`
- `TypeScript`
- `@nuxt/ui` v4
- `Tailwind CSS` v4
- `Drizzle ORM`
- `drizzle-kit`
- `@libsql/client`
- `Turso` / `libSQL`
- `Zod`
- `@vueuse/nuxt`
- `Cloudflare Workers` via Nitro

## Prerequisites

Before running the app locally, make sure you have:

- Node.js LTS
- `npm` 10+ (`package.json` declares `npm@10.9.0`)
- a Turso / libSQL database
- valid `TURSO_URL` and `TURSO_TOKEN`
- a Resend account plus a verified sender domain if you want to send documents by e-mail
- WooCommerce API credentials if you want to use the import tool

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in the required values in `.env`.

Provision the database schema and create a first account:

```bash
npm run db:push
node scripts/seed-user.mjs
```

Run the dev server:

```bash
npm run dev
```

Useful first screens to check:

- `/`
- `/sales/new`
- `/tickets`
- `/documents`
- `/payments`
- `/reports/daily`
- `/inbox`
- `/tools/woocommerce-import`

## Environment Variables

Defined in [`.env.example`](./.env.example):

```bash
NUXT_PUBLIC_SITE_URL=
TURSO_URL=
TURSO_TOKEN=
MINIMAX_API_KEY=
MINIMAX_MODEL=MiniMax-M2.7
MINIMAX_BASE_URL=https://api.minimax.io/v1
RESEND_API_KEY=
MAIL_FROM=
MAIL_REPLY_TO=
WOOCOMMERCE_STORE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
NUXT_SESSION_PASSWORD=
```

Database:

- `TURSO_URL`: Turso database URL
- `TURSO_TOKEN`: Turso auth token

Public app metadata:

- `NUXT_PUBLIC_SITE_URL`: public site URL, mainly used for OG image generation

Authentication:

- `NUXT_SESSION_PASSWORD`: secret used to seal session cookies, min. 32 chars

Generate one with:

```bash
openssl rand -base64 32
```

Outgoing e-mail / Resend:

- `RESEND_API_KEY`: Resend API key used to send commercial documents and read sent-email history
- `MAIL_FROM`: authenticated sender for outgoing e-mails, for example `Microwest <info@microwest.ch>`
- `MAIL_REPLY_TO`: optional reply-to address

WooCommerce:

- `WOOCOMMERCE_STORE_URL`: WooCommerce store base URL, for example `https://shopyphone.ch`
- `WOOCOMMERCE_CONSUMER_KEY`: WooCommerce REST API consumer key
- `WOOCOMMERCE_CONSUMER_SECRET`: WooCommerce REST API consumer secret

Internal AI assistant:

- `MINIMAX_API_KEY`: MiniMax API key used server-side by the internal assistant
- `MINIMAX_MODEL`: MiniMax model id, defaults to `MiniMax-M2.7`
- `MINIMAX_BASE_URL`: MiniMax API base URL, defaults to `https://api.minimax.io/v1`

Notes:

- `MAIL_FROM` must use a sender on a domain verified in Resend
- WooCommerce credentials are only used server-side

## Key Routes

Core dashboard routes:

- overview: [`app/pages/index.vue`](./app/pages/index.vue)
- customers: [`app/pages/customers/index.vue`](./app/pages/customers/index.vue)
- catalog: [`app/pages/catalog/index.vue`](./app/pages/catalog/index.vue)
- tickets: [`app/pages/tickets/index.vue`](./app/pages/tickets/index.vue)
- documents: [`app/pages/documents/index.vue`](./app/pages/documents/index.vue)
- payments: [`app/pages/payments/index.vue`](./app/pages/payments/index.vue)
- reports: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

Operator flows:

- quick sale: [`app/pages/sales/new.vue`](./app/pages/sales/new.vue)
- new ticket: [`app/pages/tickets/new.vue`](./app/pages/tickets/new.vue)
- ticket detail: [`app/pages/tickets/[id].vue`](./app/pages/tickets/[id].vue)
- new document: [`app/pages/documents/new.vue`](./app/pages/documents/new.vue)
- document detail: [`app/pages/documents/[id]/index.vue`](./app/pages/documents/[id]/index.vue)
- document print: [`app/pages/documents/[id]/print.vue`](./app/pages/documents/[id]/print.vue)

Secondary modules:

- sent e-mails: [`app/pages/inbox.vue`](./app/pages/inbox.vue)
- WooCommerce import: [`app/pages/tools/woocommerce-import.vue`](./app/pages/tools/woocommerce-import.vue)
- vacations: [`app/pages/vacances.vue`](./app/pages/vacances.vue)
- smartphone stock: [`app/pages/stocks-smartphone.vue`](./app/pages/stocks-smartphone.vue)
- smartphone reservations: [`app/pages/reservations-smartphone.vue`](./app/pages/reservations-smartphone.vue)
- assistant: [`app/pages/assistant.vue`](./app/pages/assistant.vue)
- company settings: [`app/pages/settings/company.vue`](./app/pages/settings/company.vue)
- customer SMS settings: [`app/pages/settings/customer-sms.vue`](./app/pages/settings/customer-sms.vue)

The default sidebar navigation is defined in [`app/layouts/default.vue`](./app/layouts/default.vue).

## Resend Integration

Resend is used for two things:

- sending commercial documents by e-mail
- viewing sent e-mail history in `/inbox`

Relevant files:

- send endpoint: [`server/api/documents/[id]/email.post.ts`](./server/api/documents/[id]/email.post.ts)
- sent-email list endpoint: [`server/api/sent-emails/index.get.ts`](./server/api/sent-emails/index.get.ts)
- sent-email detail endpoint: [`server/api/sent-emails/[id].get.ts`](./server/api/sent-emails/[id].get.ts)
- sent-email server logic: [`server/utils/sent-emails.ts`](./server/utils/sent-emails.ts)
- UI: [`app/pages/inbox.vue`](./app/pages/inbox.vue)

Current scope:

- read-only sent-email history
- list + detail view
- no local sync journal in v1
- Resend remains the source of truth

## WooCommerce Import

The POS includes a WooCommerce import tool at `/tools/woocommerce-import`.

It turns a WooCommerce order into a POS invoice while preserving the current POS model.

Current behavior:

- list of open Woo statuses: `pending`, `processing`, `on-hold`
- manual import by Woo order number or id
- duplicate imports blocked through `document_imports`
- imported invoices stay editable in the POS
- source order number added as a zero-value line, for example `Commande ShopyPhone #72787`

Current v1 constraints:

- supported currency: `CHF`
- coupons / discounts are rejected
- Woo payments are not imported
- if Woo returns no tax for a positive line, the importer falls back to the current POS default VAT rate (`8.1%`)
- civilities incorrectly stored in Woo `company` fields such as `Monsieur` or `Madame` are ignored during customer creation

Relevant files:

- page: [`app/pages/tools/woocommerce-import.vue`](./app/pages/tools/woocommerce-import.vue)
- orders API: [`server/api/tools/woocommerce/orders.get.ts`](./server/api/tools/woocommerce/orders.get.ts)
- import API: [`server/api/tools/woocommerce/import.post.ts`](./server/api/tools/woocommerce/import.post.ts)
- server logic: [`server/utils/woocommerce.ts`](./server/utils/woocommerce.ts)

## Authentication

The app uses session-based authentication powered by [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).

Protected business routes:

- all main `/api/**` business routes go through [`server/middleware/auth.ts`](./server/middleware/auth.ts)
- auth/session endpoints stay reachable for the login flow
- a global client middleware redirects unauthenticated users to `/login`

There is no public sign-up.
Users are created manually through the CLI script.

First-time setup:

```bash
npm run db:push
node scripts/seed-user.mjs
```

The script prompts for email, display name and password.
Running it again with the same email updates the existing user.

Relevant files:

- schema: [`server/db/schema.ts`](./server/db/schema.ts)
- login route: [`server/api/auth/login.post.ts`](./server/api/auth/login.post.ts)
- server middleware: [`server/middleware/auth.ts`](./server/middleware/auth.ts)
- session revalidation: [`server/plugins/session.ts`](./server/plugins/session.ts)
- client middleware: [`app/middleware/auth.global.ts`](./app/middleware/auth.global.ts)
- login page: [`app/pages/login.vue`](./app/pages/login.vue)

## Local Workflow

Useful scripts:

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run preview
npm run deploy
npm run db:push
npm run db:studio
npm run cf-typegen
```

Recommended local workflow:

1. `npm install`
2. `cp .env.example .env`
3. `npm run db:push`
4. `node scripts/seed-user.mjs`
5. `npm run dev`
6. `npm run lint`
7. `npm run typecheck`
8. `npm run build` when changing app wiring, server routes or deployment-sensitive logic

Useful local checks:

- test document e-mail sending from a document detail page
- open `/inbox` to confirm sent e-mails load from Resend
- open `/tools/woocommerce-import` to confirm Woo orders load
- use `npm run db:studio` to inspect data quickly

## Architecture

### Data Model

Main tables:

- `customers`
- `catalog_items`
- `tickets`
- `ticket_events`
- `documents`
- `document_lines`
- `document_imports`
- `payments`
- `company_settings`
- `smartphone_stocks`
- `vacation_entries`

Main schema file:

- [`server/db/schema.ts`](./server/db/schema.ts)

### Shared POS Layer

Shared business vocabulary lives here:

- constants: [`shared/constants/pos.ts`](./shared/constants/pos.ts)
- types: [`shared/types/pos.ts`](./shared/types/pos.ts)
- utilities: [`shared/utils/pos.ts`](./shared/utils/pos.ts)
- validation schemas: [`shared/validation/pos.ts`](./shared/validation/pos.ts)

### Server Structure

Main POS services:

- [`server/utils/pos/customers.ts`](./server/utils/pos/customers.ts)
- [`server/utils/pos/catalog.ts`](./server/utils/pos/catalog.ts)
- [`server/utils/pos/tickets.ts`](./server/utils/pos/tickets.ts)
- [`server/utils/pos/documents.ts`](./server/utils/pos/documents.ts)
- [`server/utils/pos/payments.ts`](./server/utils/pos/payments.ts)
- [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)
- [`server/utils/pos/core.ts`](./server/utils/pos/core.ts)

Integration-specific services:

- [`server/utils/woocommerce.ts`](./server/utils/woocommerce.ts)
- [`server/utils/company-settings.ts`](./server/utils/company-settings.ts)
- [`server/utils/customer-sms-settings.ts`](./server/utils/customer-sms-settings.ts)
- [`server/utils/assistant/`](./server/utils/assistant/)

### POS Bootstrap

On first access to POS-backed flows, the app can automatically:

- ensure the main POS schema exists
- run compatibility migrations for older structures
- create company settings if missing
- recalculate stored document totals
- seed sample POS data
- create vacation-related tables

Relevant files:

- schema: [`server/db/schema.ts`](./server/db/schema.ts)
- drizzle config: [`drizzle.config.ts`](./drizzle.config.ts)
- Turso connection: [`server/utils/turso.ts`](./server/utils/turso.ts)
- bootstrap and numbering: [`server/utils/pos/core.ts`](./server/utils/pos/core.ts)

## Internal AI Assistant

The dashboard includes an internal `/assistant` route backed by a guarded database capability.

Scope:

- read-only SQL
- strict allowlist and validation layer
- server-side provider configuration through MiniMax env vars

Relevant files:

- UI route: [`app/pages/assistant.vue`](./app/pages/assistant.vue)
- API route: [`server/api/assistant/chat.post.ts`](./server/api/assistant/chat.post.ts)
- server logic: [`server/utils/assistant/`](./server/utils/assistant/)
- internal documentation: [`docs/ai-assistant.md`](./docs/ai-assistant.md)

## End-Of-Day Reporting

The daily report is designed for quick store-closing checks.

Current output includes:

- total paid today
- invoices paid today
- totals by payment method
- number of open tickets
- number of tickets opened today
- number of tickets closed today
- turnover split by document line category when available

Relevant files:

- API: [`server/api/reports/end-of-day.get.ts`](./server/api/reports/end-of-day.get.ts)
- service: [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)
- page: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

## Deployment Notes

The app uses the `cloudflare_module` Nitro preset configured in [`nuxt.config.ts`](./nuxt.config.ts).

Deployment workflow:

```bash
npm run build
npm run preview
npm run deploy
```

Notes:

- use the provided npm scripts instead of calling `wrangler` from the repo root directly
- preview and deploy both run against `.output`
- if you change the data model, update [`server/db/schema.ts`](./server/db/schema.ts) first, then run `npm run db:push`
- if you change server routes, Nitro behavior or Cloudflare Worker-sensitive logic, run `npm run build`
