# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Lines of Code](https://img.shields.io/endpoint?url=https://ghloc.vercel.app/api/dwennk/004-nuxt/badge)](https://ghloc.vercel.app/github/dwennk/004-nuxt)

Nuxt 4 POS and shop-management app for a physical tech store.

The app is built for day-to-day in-store operations with a strict business split between:

- `ticket`: customer case for repairs, diagnostics, support, sales or tracked follow-up, with a **DOS-** reference (see [reference conversion guide](docs/dossier-naming.md))
- `document`: commercial object such as a quote, customer order or invoice, or an operational after-sales return (`sav`)
- `payment`: cashflow object tracked separately from tickets and documents

The app uses Nuxt server routes, Drizzle ORM and Turso/libSQL, and targets Cloudflare Workers through Nitro. User-facing copy is in French.

This README describes the code in the repository, not a verified production deployment. Versioned database migrations and integration setup must be verified against the target environment before deployment.

## Product Scope

Current core scope:

- counter workspace with global search, pickups, outstanding payments and blocked tickets
- customers and product / repair / service catalog
- direct sales and repair / support tickets
- after-sales returns with their own commercial documents and payments
- quotes, customer orders and invoices, including print / PDF output
- payments, recorded refunds, reporting and end-of-day checks
- shared case editing with reservations, presence and conflict protection
- company settings and administrator-managed user accounts
- manual and scheduled Turso backups to Dropbox

Secondary business modules:

- smartphone stock
- smartphone reservations
- vacation tracking
- sent e-mails viewer
- Shopify order and payment import
- MobileSentrix product search and OAuth connection
- customer SMS settings / QR flows
- internal AI assistant
- interface preferences and games

`/inbox` is an administrator-only sent-mail journal, not an incoming mailbox. `/tools/woocommerce-import` is a compatibility redirect to the Shopify tool, not an active WooCommerce integration.

## Main Workflows

Typical business flows:

- tracked repair: `Ticket -> Quote -> Invoice -> Payment -> Ticket closed`
- customer order: `Ticket or direct context -> Customer order -> Invoice -> Payment`
- direct sale: `Quick sale -> Invoice -> Payment`
- quick support: `Invoice -> Payment`
- Shopify import: `Shopify order -> POS invoice + Shopify payments`

Within a customer case, quote, order and invoice are successive stages of one operation.
Each after-sales return can have its own independent commercial operation; its documents
share a `savId` and never reuse payments from the initial repair or another return.
See [after-sales workflow](docs/sav.md).
A quote is optional: an order can be created directly, and a direct invoice remains supported.
The current invoice takes over from the order for collection; their totals are never added together.
Invoice lines inherit the order, then the quote, then the case lines, in that order.
Order deposits retain their original payment IDs, dates and document links and are deducted from the invoice.
This also applies to existing linked documents without a data migration; standalone documents remain independent until explicitly converted.
From a quote, create an order or invoice; from an order, create an invoice.
`POST /api/documents/:id/convert` creates a `sale` case only when the source has
none, attaching the source and successor in the same transaction. Existing
repair, support and after-sales scopes are retained. Lines and customer notes are copied;
quote expiry is not reused as invoice due date. Original numbers and receipts stay
unchanged. Retries reopen the existing stage, and the same customer alone never
links independent documents. Sale cases use preparation / handover / closure
instead of the workshop diagnostic workflow. This adds an application-level text
enum value only; no SQL migration or historical backfill is required.
The previous stage stays readable and printable. New collections and commercial edits use the current stage.
Cancelling an unpaid invoice restores the order balance; cancellation or a lower total is rejected while it conflicts with collected deposits.

Important product rules:

- money is stored as integer cents
- pricing is VAT-inclusive
- VAT exists both on lines and documents
- document line quantity is stored as an integer
- line quantities stay positive; negative VAT-inclusive unit prices are allowed for discounts and adjustments, including their negative VAT
- documents and quick sales cannot end with a negative total; credit notes are not a supported document type
- payment methods are `cash`, `card_twint`, `bank_transfer`, `stripe` and the import-specific `shopify`
- ticket and document numbers are generated server-side
- direct sales can happen without a ticket
- payments are tracked separately from documents
- financial creation routes require an `Idempotency-Key` to prevent duplicate documents and payments on retry; see [API contracts](./docs/api-contracts.md)

### Refunds and Payment Corrections

Receipts are positive payment movements. Refunds are separate negative movements linked to the original receipt, with their own date, method and reason. Recording a refund documents money already returned to the customer; it does not call a payment provider to return funds.

An administrator can either correct the payment balance only or also reduce the current invoice's amount due through an immutable `document_credits` adjustment. Invoice lines and the original total remain unchanged. Cancelling an incorrectly entered receipt requires a reason and removes it from cashflow totals without inventing a refund.

See [payment ledger and refund rules](./docs/payment-ledger.md), including the required additive migration and reporting semantics.

### Shared Case Editing

Multiple operators can view the same case. Editing reserves it for a specific account and browser tab; writes require reservation proof and the current revision. A confirmed takeover invalidates the previous editor's proof. The UI also tracks unsaved changes and provides inactivity reminders.

Use `useDossierFetch()` for mutations to existing cases. See [case editing, reservations and reminders](./docs/dossier-editing.md) for the HTTP contract, recovery behavior and optional browser tests.

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

Use the toolchain pinned by the repository:

- Node.js 22.23.2 ([`.node-version`](./.node-version), also used by CI)
- `npm` 10.9.9 (`package.json` and CI use the same version)

The authenticated app also needs a prepared Turso / libSQL development database, `TURSO_URL`, `TURSO_TOKEN` and a session secret. Unit and local SQLite integration tests do not require production credentials. External integrations are optional for working on unrelated POS features.

## Quick Start

Install dependencies:

```bash
npm ci
```

Create a local environment file only if you do not already have one:

```bash
cp .env.example .env
```

Fill in `.env` with credentials for a dedicated development database, never production. Generate `NUXT_SESSION_PASSWORD` with `openssl rand -base64 32`.

Prepare that database before starting the app. It no longer creates the POS schema or demo data automatically. For an empty development database, `db:push` uses [`server/db/schema.ts`](./server/db/schema.ts). A remote development target must be mapped to `development` in `DB_REMOTE_TARGETS` and explicitly confirmed:

```bash
DB_TARGET_ENV=development DB_CONFIRM_TARGET="development-database-host" npm run db:push
```

Replace the placeholder with the exact hostname from your development `TURSO_URL`; the allowlist belongs in your protected environment. Do not relabel an existing staging or production database as development. For those databases, follow the [migration runbook](./docs/database-migrations.md), not `db:push`.

Create the first administrator on the same development database:

```bash
node scripts/seed-user.mjs
```

The script prompts for email, name and password. Pass an explicit local target
(`--url file:./test.db`) or the remote environment and exact host confirmation
described in [Database migrations](./docs/database-migrations.md). Remote targets
must be allowlisted; production administrator creation also requires
`--allow-production-write`. Alternatively, `npm run seed:test-user -- --url
file:./test.db` creates the temporary account documented in
[Development Login](./docs/dev-login.md). Test accounts and report fixtures are
restricted to explicit local development or test databases.

Run the dev server:

```bash
npm run dev
```

Open `/login`, then `/`. The legacy `/comptoir` URL redirects to `/`. Complete company settings before issuing real documents. The development login uses Turnstile test keys by default; production builds and Worker previews need explicit Turnstile configuration.

## Environment Variables

Use [`.env.example`](./.env.example) as the complete variable template and [`nuxt.config.ts`](./nuxt.config.ts) for runtime configuration. Keep secrets in ignored local files or Worker secrets, never in Git or client-side configuration.

Database:

- `TURSO_URL`: Turso database URL
- `TURSO_TOKEN`: Turso auth token
- `DB_REMOTE_TARGETS`: JSON allowlist mapping approved remote database hostnames to environments, used by database tooling
- `TURSO_ORGANIZATION` and `TURSO_PLATFORM_TOKEN`: optional CLI-only usage reporting credentials, distinct from the database token and excluded from Worker runtime configuration
- `POS_ALLOW_RUNTIME_SCHEMA_BOOTSTRAP` and `POS_ALLOW_RUNTIME_DEMO_SEED`: disabled by default; temporary local compatibility switches only, never staging or production

Additional migration confirmations and backup requirements are described in the [database runbook](./docs/database-migrations.md).

Dropbox backups:

- `NUXT_DROPBOX_APP_KEY` and `NUXT_DROPBOX_APP_SECRET`: Dropbox application credentials
- `NUXT_DROPBOX_REDIRECT_URI`: exact OAuth callback URL ending in `/api/settings/backups/dropbox/callback`
- `NUXT_BACKUP_ENCRYPTION_KEY`: 32 random bytes encoded as base64, used to encrypt the stored Dropbox refresh token; keep a separate recovery copy outside Turso
- See [backup setup and recovery](./docs/backups.md) for migration, permissions and restore checks.

Authentication:

- `NUXT_SESSION_PASSWORD`: secret used to seal session cookies, min. 32 chars
- `NUXT_PUBLIC_TURNSTILE_SITE_KEY`: public login widget key
- `NUXT_TURNSTILE_SECRET_KEY`: server-side Turnstile verification key

Only development mode supplies fallback Turnstile test keys. Production requires a widget configured for the login hostname. For a local Worker preview, explicitly use test keys and a disposable database.

Generate a session secret with:

```bash
openssl rand -base64 32
```

Outgoing e-mail / Cloudflare:

- `MAIL_FROM`: authenticated sender for outgoing e-mails, for example `Microwest <info@microwest.ch>`
- `MAIL_REPLY_TO`: optional reply-to address
- `EMAIL`: native Worker binding restricted to `info@microwest.ch` in `wrangler.json`; no sending API key
- See [`docs/cloudflare-email.md`](./docs/cloudflare-email.md) for the database and production activation gates.

Shopify:

- `NUXT_SHOPIFY_SHOP_DOMAIN`: exact `*.myshopify.com` hostname
- `NUXT_SHOPIFY_CLIENT_ID` and `NUXT_SHOPIFY_CLIENT_SECRET`: installed Dev Dashboard application
- `NUXT_SHOPIFY_ADMIN_ACCESS_TOKEN`: alternative existing Admin token; do not combine authentication modes
- See [`docs/shopify-import.md`](./docs/shopify-import.md) for scopes and setup.

MobileSentrix:

- `MOBILESENTRIX_BASE_URL` and `MOBILESENTRIX_CONSUMER_NAME`: service URL and consumer name
- `MOBILESENTRIX_CONSUMER_KEY` / `MOBILESENTRIX_CONSUMER_SECRET`: OAuth application credentials
- `MOBILESENTRIX_ACCESS_TOKEN` / `MOBILESENTRIX_ACCESS_TOKEN_SECRET`: authorized OAuth tokens
- `MOBILESENTRIX_REST_AUTH_HEADER_NAME` / `MOBILESENTRIX_REST_AUTH_HEADER_VALUE`: optional paired server-side REST header configuration (`ms-token`); leave both empty when unused
- See [`docs/mobilesentrix.md`](./docs/mobilesentrix.md) for setup and verification.

Internal AI assistant:

- `MINIMAX_API_KEY`: MiniMax API key used server-side by the internal assistant
- `MINIMAX_MODEL`: MiniMax model id, defaults to `MiniMax-M3`
- `MINIMAX_BASE_URL`: MiniMax API base URL, defaults to `https://api.minimax.io/v1`

Notes:

- `MAIL_FROM` must match the binding restriction and a domain verified for Cloudflare Email Sending
- Shopify credentials are only used server-side
- `NUXT_PUBLIC_SITE_URL` remains in the environment template, but the current app has no site-URL / OG-generation consumer; it is not required for POS flows

## Key Routes

Core dashboard routes:

- counter workspace: [`app/pages/index.vue`](./app/pages/index.vue)
- customers: [`app/pages/customers/index.vue`](./app/pages/customers/index.vue)
- catalog: [`app/pages/catalog/index.vue`](./app/pages/catalog/index.vue)
- tickets: [`app/pages/dossiers/index.vue`](./app/pages/dossiers/index.vue)
- documents: [`app/pages/documents/index.vue`](./app/pages/documents/index.vue)
- payments: [`app/pages/payments/index.vue`](./app/pages/payments/index.vue)
- reports and rankings: [`app/pages/reports/index.vue`](./app/pages/reports/index.vue)
- end-of-day report: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

Operator flows:

- quick sale: [`app/pages/sales/new.vue`](./app/pages/sales/new.vue)
- new ticket: [`app/pages/dossiers/new.vue`](./app/pages/dossiers/new.vue)
- ticket detail: [`app/pages/dossiers/[id]/index.vue`](./app/pages/dossiers/[id]/index.vue)
- ticket editing and print: [`edit.vue`](./app/pages/dossiers/[id]/edit.vue), [`print.vue`](./app/pages/dossiers/[id]/print.vue)
- new document: [`app/pages/documents/new.vue`](./app/pages/documents/new.vue)
- document detail: [`app/pages/documents/[id]/index.vue`](./app/pages/documents/[id]/index.vue)
- document print: [`app/pages/documents/[id]/print.vue`](./app/pages/documents/[id]/print.vue)

Secondary modules:

- sent e-mails: [`app/pages/inbox.vue`](./app/pages/inbox.vue)
- Shopify import: [`app/pages/tools/shopify-import.vue`](./app/pages/tools/shopify-import.vue)
- MobileSentrix: [`app/pages/tools/mobilesentrix.vue`](./app/pages/tools/mobilesentrix.vue)
- vacations: [`app/pages/vacances.vue`](./app/pages/vacances.vue)
- smartphone stock: [`app/pages/stocks-smartphone.vue`](./app/pages/stocks-smartphone.vue)
- smartphone reservations: [`app/pages/reservations-smartphone.vue`](./app/pages/reservations-smartphone.vue)
- assistant: [`app/pages/assistant.vue`](./app/pages/assistant.vue)
- company settings: [`app/pages/settings/company.vue`](./app/pages/settings/company.vue)
- backup settings and history: [`app/pages/settings/backups.vue`](./app/pages/settings/backups.vue)
- user administration: [`app/pages/settings/users.vue`](./app/pages/settings/users.vue)
- interface settings: [`app/pages/settings/interface.vue`](./app/pages/settings/interface.vue)
- customer SMS settings: [`app/pages/settings/customer-sms.vue`](./app/pages/settings/customer-sms.vue)

The default sidebar navigation is defined in [`app/layouts/default.vue`](./app/layouts/default.vue).

## Cloudflare Email Integration

The native Cloudflare binding and the Turso journal provide:

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
- durable local history for new attempts, with stable date/ID pagination
- idempotent sending with the existing PDF and reply-to address
- delivery events consumed through a private Queue by the existing Worker
- no inbound mail, open/click tracking, preview retention dependency or automatic purge

Previous Resend messages are neither imported nor deleted. The adoption baseline
and email journal migration are versioned in `drizzle/`; their presence does not
prove they are applied to a remote target. Verify the target ledger, tested restore,
binding and queues before activation. Follow the setup procedure in
[`docs/cloudflare-email.md`](./docs/cloudflare-email.md); its dated deployment
observations are historical, not current environment status.

## Shopify Import

The POS includes an administrator-only import tool at `/tools/shopify-import`.
It imports open Shopify orders into invoices with their successful payments,
using the dedicated `shopify` payment method. Later captures can be retrieved
with the payment refresh action without duplicating existing transactions.

The integration supports CHF, discounts, free items, shipping and actual Shopify
VAT. Unsupported refunds, gift-card/store-credit payments, duties and inconsistent
totals are rejected before writing. Existing WooCommerce invoices remain intact.
The old page redirects to Shopify; WooCommerce API credentials are no longer used.

See [Shopify configuration and import behavior](./docs/shopify-import.md) for
credentials, permissions, reconciliation rules and local validation.

## MobileSentrix

The `/tools/mobilesentrix` integration uses OAuth plus the server-side `ms-token`
header supplied by MobileSentrix to authorize REST requests through Cloudflare.
See [MobileSentrix configuration and live checks](./docs/mobilesentrix.md) for local
environment variables, Worker secrets and verification steps.

## Database Backups

Administrators manage Dropbox connections, manual backups, the daily schedule and run history at `/settings/backups`. The existing Worker schedules backups at 02:00 UTC; exports run only when Dropbox is connected and daily backups are enabled.

Backups are standalone SQLite `.db` files built from the native Turso snapshot and committed write-ahead log. Before upload, the Worker checks database integrity, foreign keys and the current backup run marker. Dropbox uploads are verified by size and content hash. Exports are limited to 16 MiB; failures do not publish partial files.

An unresolved failure remains visible in settings and navigation until a later successful backup. Files are not automatically deleted. The application encrypts the stored Dropbox refresh token, not the exported database file. A backup must be restored and checked separately before it can be relied on for recovery.

See [Dropbox backup setup, limits and recovery](./docs/backups.md).

## Authentication

The app uses session-based authentication powered by [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).

Protected business routes:

- all main `/api/**` business routes go through [`server/middleware/auth.ts`](./server/middleware/auth.ts)
- auth/session endpoints stay reachable for the login flow
- a global client middleware redirects unauthenticated users to `/login`

There is no public sign-up. Bootstrap the first administrator with `scripts/seed-user.mjs`, then manage users, roles, activation and password resets in `/settings/users`. Running the seed again updates and reactivates the account and grants administrator rights.

Authorization is enforced server-side using [capabilities](./shared/utils/capabilities.ts): operators can read and record financial operations; financial adjustments, record deletion and administration require an administrator. Sessions revalidate the active account and current permissions against the database. Login also includes Turnstile verification, a honeypot and failed-attempt throttling.

Relevant files:

- schema: [`server/db/schema.ts`](./server/db/schema.ts)
- login route: [`server/api/auth/login.post.ts`](./server/api/auth/login.post.ts)
- server middleware: [`server/middleware/auth.ts`](./server/middleware/auth.ts)
- session revalidation: [`server/plugins/session.ts`](./server/plugins/session.ts)
- client middleware: [`app/middleware/auth.global.ts`](./app/middleware/auth.global.ts)
- login page: [`app/pages/login.vue`](./app/pages/login.vue)

## Development and Verification

Scripts are defined in [`package.json`](./package.json):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Prepare scanner WASM assets and start Nuxt development mode |
| `npm run lint` / `npm run typecheck` | ESLint and Nuxt / Vue TypeScript checks |
| `npm run test` | Unit, integration and security tests |
| `npm run test:unit` / `npm run test:integration` / `npm run test:security` | Run one test group |
| `npm run security:regression` | Additional repository security regression checks |
| `npm run build` | Prepare scanner WASM assets and build the Worker output |
| `npm run check` | Lint, typecheck, tests, security regression and build |
| `npm run test:e2e` | Playwright login-page smoke test; case editing tests require explicit isolated setup |
| `npm run preview` | Rebuild, then run Wrangler locally against `.output` |
| `npm run deploy` | Rebuild, then deploy `.output` with `--keep-vars` |
| `npm run cf-typegen` | Generate Worker binding types in `server/types/cloudflare-env.d.ts` |
| `npm run db:push` / `npm run db:studio` | Development schema push / database UI; verify the configured target first |
| `npm run db:introspect` / `npm run db:verify` | Database inventory / schema and invariant verification |
| `npm run db:status` | Compare migration files and database ledger; `-- --local-only` avoids database access |
| `npm run db:usage` | Read Turso organization usage through the Platform API without application SQL |
| `npm run db:migrate` | Plan migrations; writes require `-- --apply` and applicable target confirmations |
| `npm run db:backfill:document-totals` | Bounded, resumable totals backfill; plan-only unless `-- --apply` is supplied |
| `npm run seed:test-user` | Create or refresh the temporary development administrator |

Run lint and typecheck after meaningful code changes, plus the relevant tests. Use `npm run check` for the full non-browser gate and `npm run preview` for Worker-specific behavior. Do not edit generated `.nuxt/` or `.output/` files.

For the browser smoke test, install Playwright's bundled Chromium once:

```bash
npx playwright install chromium
npm run test:e2e
```

[`playwright.config.ts`](./playwright.config.ts) uses a 1440×900 viewport and starts or reuses a local server on port 3000. It does not launch the system Google Chrome application. The default smoke test checks the login shell, not an authenticated sale or an external integration. The optional case editing suite requires `POS_DOSSIER_E2E_URL` and an isolated server with disposable fixtures; it modifies those records. Follow [the test setup](./docs/dossier-editing.md) before enabling it. UI changes still need a desktop check and a mobile check when responsive behavior is affected.

The [CI workflow](./.github/workflows/ci.yml) runs `npm ci`, `npm run check`, then the browser smoke job. It does not deploy the Worker. Local e-mail simulation, passing tests and a Git push are not proof of a live delivery or deployment.

## Architecture

### Data Model

Main tables and reporting view:

- `customers`
- `counter_customer`
- `catalog_items`
- `tickets`
- `ticket_events`
- `ticket_lines`
- `documents`
- `document_lines`
- `document_imports`
- `payments`
- `document_credits` and the `payment_movements` reporting view
- `dossier_scopes`, `dossier_presences` and `dossier_handovers`
- `number_sequences`
- `company_settings`
- `smartphone_stocks`
- `smartphone_reservation_requests`
- `employees`
- `vacation_entries`
- `users` and `login_attempts`
- `sent_emails` and `sent_email_events`
- `backup_settings` and `backup_runs`

Main schema file:

- [`server/db/schema.ts`](./server/db/schema.ts)

### Shared POS Layer

Shared business vocabulary lives here:

- constants: [`shared/constants/pos.ts`](./shared/constants/pos.ts)
- types: [`shared/types/pos.ts`](./shared/types/pos.ts)
- utilities: [`shared/utils/pos.ts`](./shared/utils/pos.ts)
- validation schemas: [`shared/validation/pos.ts`](./shared/validation/pos.ts)
- pure money, payment, ticket workflow and document revision rules: [`shared/domain/`](./shared/domain/)

`app/` and `server/` both depend on `shared/`, never the reverse. Server modules must not import application code. See [architecture boundaries](./docs/architecture-boundaries.md).

### Server Structure

Main POS services:

- [`server/utils/pos/customers.ts`](./server/utils/pos/customers.ts)
- [`server/utils/pos/catalog.ts`](./server/utils/pos/catalog.ts)
- [`server/utils/pos/tickets.ts`](./server/utils/pos/tickets.ts)
- [`server/utils/pos/documents.ts`](./server/utils/pos/documents.ts)
- [`server/utils/pos/payments.ts`](./server/utils/pos/payments.ts)
- [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)
- [`server/utils/pos/schema.ts`](./server/utils/pos/schema.ts)
- [`server/utils/pos/dossiers.ts`](./server/utils/pos/dossiers.ts)
- [`server/utils/pos/payment-corrections.ts`](./server/utils/pos/payment-corrections.ts)

Integration-specific services:

- [`server/utils/shopify/import.ts`](./server/utils/shopify/import.ts)
- [`server/utils/company-settings.ts`](./server/utils/company-settings.ts)
- [`server/utils/customer-sms-settings.ts`](./server/utils/customer-sms-settings.ts)
- [`server/utils/assistant/`](./server/utils/assistant/)
- [`server/utils/backups/`](./server/utils/backups/)

### Database Lifecycle

The schema contract is [`server/db/schema.ts`](./server/db/schema.ts), the connection is in [`server/utils/turso.ts`](./server/utils/turso.ts), and tooling safety checks start in [`drizzle.config.ts`](./drizzle.config.ts).

`ensurePosSchema()` in [`server/utils/pos/schema.ts`](./server/utils/pos/schema.ts) performs no database I/O by default. Legacy schema bootstrap is available only behind an explicit local compatibility switch. Demo seeding additionally requires its own switch. Neither belongs on the staging / production request path. Stored document totals are repaired by the explicit bounded backfill command, not by a cold-start recalculation.

The repository contains the real adoption baseline `20260902155258_talented_songbird` and subsequent versioned migrations in [`drizzle/`](./drizzle/README.md). An introspection baseline adopts an existing database; its commented SQL cannot provision an empty one. Do not generate a synthetic initial migration and apply it to the existing POS database. Check the committed inventory with `npm run db:status -- --local-only`, then verify the intended target's migration ledger separately.

Before any production schema change: inventory the exact target, verify a backup restore and its baseline ledger, review and rehearse the additive migration, then verify it before switching the Worker. `db:push` is for development only, not staging or production. The full procedure and rollback gates are in [Database migrations](./docs/database-migrations.md).

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

## Reporting

`/reports` provides payment charts and customer / article rankings. `/reports/daily` remains the detailed end-of-day view. Payment breakdowns include imported Shopify payments.

The daily report is designed for quick store-closing checks.

Current output includes:

- net cashflow for the selected business day in the Europe/Zurich timezone
- individual receipts and refunds, including deposits and split payments, with document, customer, time, method and amount
- settled invoices with a payment movement that day, plus outstanding invoices issued that day
- net totals and movement counts by payment method
- number of open tickets
- number of tickets opened today
- number of tickets closed today
- current settled invoice value split by document line category when available

The printed daily report lists payment movements, including deposits on quotes or orders and partial payments on invoices that remain unpaid. Refunds appear on their own payment date. Rankings and category totals describe current settled invoice value; they are not the cash ledger or an invoice-date tax report. See [payment ledger semantics](./docs/payment-ledger.md).

Relevant files:

- API: [`server/api/reports/end-of-day.get.ts`](./server/api/reports/end-of-day.get.ts)
- service: [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)
- page: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

## Deployment Notes

The app uses the `cloudflare_module` Nitro preset configured in [`nuxt.config.ts`](./nuxt.config.ts).

For local Worker verification:

```bash
npm run preview
```

`preview` already rebuilds the app. Use a disposable development database and explicit test configuration; local Wrangler execution does not make a remote Turso database disposable.

Before an authorized production deployment:

1. Run `npm run check` and the relevant browser / Worker checks.
2. Complete the [database migration gate](./docs/database-migrations.md), including backup restore verification and a recorded rollback reference.
3. For e-mail or backups, also complete [Cloudflare e-mail activation](./docs/cloudflare-email.md) or [Dropbox backup setup](./docs/backups.md). Use reviewed migrations in `drizzle/`; SQL candidates under `docs/sql/` are not the production migration ledger.
4. Verify the Cloudflare account, Worker target, required runtime secrets, bindings and queues. Changing `.env` does not update Worker secrets.
5. Deploy using the release procedure. `npm run deploy` rebuilds and directly deploys `.output` with `--keep-vars`; it is not the staged promotion workflow described in the migration runbook.
6. Verify the affected screens and external integrations on the deployed version. A successful build or upload alone is not a live functional check.

[`wrangler.json`](./wrangler.json) declares Worker `nuxt` and the custom domain `pos.microwest.ch`. Use the provided preview / deploy scripts so Wrangler reads the generated `.output` configuration. Do not change that output by hand. A Worker rollback does not restore the external Turso database.

## Further Documentation

- [Repository working rules](./AGENTS.md)
- [Database migrations, verification and rollback](./docs/database-migrations.md)
- [Migration directory status](./drizzle/README.md)
- [API contracts and financial idempotency](./docs/api-contracts.md)
- [Payment ledger, refunds and cancellations](./docs/payment-ledger.md)
- [Customer case references](./docs/dossier-naming.md)
- [Shared case editing and reminders](./docs/dossier-editing.md)
- [After-sales returns](./docs/sav.md)
- [Dropbox backups and recovery](./docs/backups.md)
- [Query performance and usage reporting](./docs/query-performance.md)
- [Architecture boundaries](./docs/architecture-boundaries.md)
- [Development account](./docs/dev-login.md)
- [Cloudflare document e-mails](./docs/cloudflare-email.md)
- [Shopify import](./docs/shopify-import.md)
- [MobileSentrix](./docs/mobilesentrix.md)
- [Internal AI assistant](./docs/ai-assistant.md)
