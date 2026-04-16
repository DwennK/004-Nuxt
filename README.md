# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Lines of Code](https://img.shields.io/endpoint?url=https://ghloc.vercel.app/api/dwennk/004-nuxt/badge)](https://ghloc.vercel.app/github/dwennk/004-nuxt)

Nuxt 4 POS and shop-management app for a physical tech store.

The app is built for day-to-day in-store operations with a clear business split between:

- tracked repair and service tickets
- direct sales
- commercial documents
- payments and cashflow
- end-of-day closing checks

It uses Nuxt server routes, Drizzle ORM, and Turso/libSQL, and is deployed through Nitro to Cloudflare Workers.

## Core Business Model

The project follows these rules:

- a `ticket` is an operational work case: repair, diagnostic, follow-up support, or any tracked intervention
- a `document` is the commercial object: quote, customer order, invoice, or credit note
- a `payment` is the cashflow object and is tracked separately from tickets and documents
- direct sales can happen without a ticket
- quick support can happen without a ticket when there is no follow-up workflow

Typical flows:

- tracked repair: `Ticket -> Quote -> Invoice -> Payment -> Ticket closed`
- customer order: `Ticket or direct context -> Customer order -> Invoice -> Payment`
- direct sale: `Quick sale -> Invoice -> Payment`
- quick support: `Invoice -> Payment`

## Module Status

Core POS scope:

- customers
- catalog items
- direct sales
- repair / service tickets
- commercial documents
- document lines
- payments
- end-of-day reporting
- company settings

Secondary business modules:

- smartphone stock management
- smartphone reservation flows
- vacation tracking

Demo / scaffold areas still present in the repo:

- members
- notifications
- generic profile settings
- inbox shell

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
- `npm` 10+ (the repo declares `npm@10.9.0`)
- a Turso / libSQL database
- valid `TURSO_URL` and `TURSO_TOKEN` values
- a Resend account plus a verified sender domain if you want to send documents by e-mail

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in the required database credentials in `.env`.

Run the dev server:

```bash
npm run dev
```

Main routes to check first:

- `/`
- `/sales/new`
- `/tickets`
- `/documents`
- `/payments`
- `/reports/daily`

## Environment Variables

Defined in [`.env.example`](./.env.example):

```bash
NUXT_PUBLIC_SITE_URL=
TURSO_URL=
TURSO_TOKEN=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=
RESEND_API_KEY=
MAIL_FROM=
MAIL_REPLY_TO=
```

- `NUXT_PUBLIC_SITE_URL`: public site URL, mainly used for OG image generation
- `TURSO_URL`: Turso database URL
- `TURSO_TOKEN`: Turso auth token
- `OPENAI_API_KEY`: server-side OpenAI API key for the internal assistant
- `OPENAI_MODEL`: model id used by the internal assistant
- `OPENAI_BASE_URL`: optional OpenAI-compatible base URL
- `RESEND_API_KEY`: Resend API key used to send commercial documents by e-mail
- `MAIL_FROM`: authenticated sender used for outgoing document e-mails, for example `Atelier Pixel <facturation@shop.example.ch>`
- `MAIL_REPLY_TO`: optional reply-to address for outgoing document e-mails

For document e-mail sending, `MAIL_FROM` must use an address on a domain verified in Resend.

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
3. `npm run dev`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run build` when changing app wiring, server routes, or deployment-sensitive behavior

## Internal AI Assistant

The dashboard now includes an internal `/assistant` route backed by one guarded database capability: read-only SQL under a strict allowlist and validation layer.

- UI route: [`app/pages/assistant.vue`](./app/pages/assistant.vue)
- API route: [`server/api/assistant/chat.post.ts`](./server/api/assistant/chat.post.ts)
- server logic: [`server/utils/assistant/`](./server/utils/assistant/)
- internal documentation: [`docs/ai-assistant.md`](./docs/ai-assistant.md)

## Data Model And Bootstrap

Key implementation details:

- money is stored as integer cents
- catalog and document pricing is handled as TTC / VAT-inclusive amounts
- VAT is stored at both line and document level for reporting and print output
- document line quantity is stored as an integer
- ticket numbers and document numbers are generated server-side
- customer, ticket, document, and payment types are centralized in the shared POS layer
- the POS bootstrap includes compatibility logic for older customer table shapes

On first access to POS-backed flows, the app can automatically:

- ensure the main POS schema exists
- run compatibility migrations for legacy structures
- create company settings if missing
- recalculate stored document totals
- seed sample POS data
- create vacation-related tables

Main tables:

- `customers`
- `catalog_items`
- `tickets`
- `documents`
- `document_lines`
- `payments`
- `employees`
- `vacation_entries`

Key files:

- schema: [`server/db/schema.ts`](./server/db/schema.ts)
- drizzle config: [`drizzle.config.ts`](./drizzle.config.ts)
- Turso connection: [`server/utils/turso.ts`](./server/utils/turso.ts)
- POS bootstrap, numbering, and seed data: [`server/utils/pos/core.ts`](./server/utils/pos/core.ts)

## Shared POS Layer

Shared constants, types, utilities, and validation live here:

- constants: [`shared/constants/pos.ts`](./shared/constants/pos.ts)
- types: [`shared/types/pos.ts`](./shared/types/pos.ts)
- utilities: [`shared/utils/pos.ts`](./shared/utils/pos.ts)
- validation schemas: [`shared/validation/pos.ts`](./shared/validation/pos.ts)

This keeps business vocabulary aligned across UI, server routes, and persistence.

## Server Structure

POS services:

- [`server/utils/pos/customers.ts`](./server/utils/pos/customers.ts)
- [`server/utils/pos/catalog.ts`](./server/utils/pos/catalog.ts)
- [`server/utils/pos/tickets.ts`](./server/utils/pos/tickets.ts)
- [`server/utils/pos/documents.ts`](./server/utils/pos/documents.ts)
- [`server/utils/pos/payments.ts`](./server/utils/pos/payments.ts)
- [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)

Primary POS API routes:

```text
server/api/
  customers/
    index.get.ts
    index.post.ts
    [id].get.ts
    [id].patch.ts
    [id].delete.ts
  catalog-items/
    index.get.ts
    index.post.ts
    [id].get.ts
    [id].patch.ts
    [id].delete.ts
  tickets/
    index.get.ts
    index.post.ts
    [id].get.ts
    [id].patch.ts
    [id].delete.ts
    [id]/quote.post.ts
    [id]/order.post.ts
    [id]/invoice.post.ts
    [id]/status.post.ts
    [id]/close.post.ts
  documents/
    index.get.ts
    index.post.ts
    [id].get.ts
    [id].patch.ts
    [id].delete.ts
    [id]/mark-paid.post.ts
  payments/
    index.get.ts
    index.post.ts
    [id].get.ts
    [id].patch.ts
    [id].delete.ts
  reports/
    end-of-day.get.ts
```

Other routes also exist for:

- company settings
- Swiss postal code lookup
- smartphone stock and reservation flows
- vacation tracking
- demo / scaffold endpoints such as members and notifications

## Main UI Routes

Core navigation exposed in the dashboard shell:

- overview: [`app/pages/index.vue`](./app/pages/index.vue)
- customers: [`app/pages/customers/index.vue`](./app/pages/customers/index.vue)
- catalog: [`app/pages/catalog/index.vue`](./app/pages/catalog/index.vue)
- tickets: [`app/pages/tickets/index.vue`](./app/pages/tickets/index.vue)
- documents: [`app/pages/documents/index.vue`](./app/pages/documents/index.vue)
- payments: [`app/pages/payments/index.vue`](./app/pages/payments/index.vue)
- daily report: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)
- smartphone stock: [`app/pages/stocks-smartphone.vue`](./app/pages/stocks-smartphone.vue)
- smartphone reservations: [`app/pages/reservations-smartphone.vue`](./app/pages/reservations-smartphone.vue)
- vacations: [`app/pages/vacances.vue`](./app/pages/vacances.vue)
- settings: [`app/pages/settings.vue`](./app/pages/settings.vue)
- inbox: [`app/pages/inbox.vue`](./app/pages/inbox.vue)

Main operator flows:

- quick sale: [`app/pages/sales/new.vue`](./app/pages/sales/new.vue)
- ticket detail: [`app/pages/tickets/[id].vue`](./app/pages/tickets/[id].vue)
- document creation: [`app/pages/documents/new.vue`](./app/pages/documents/new.vue)
- document detail / inline editing: [`app/pages/documents/[id]/index.vue`](./app/pages/documents/[id]/index.vue)
- document printing: [`app/pages/documents/[id]/print.vue`](./app/pages/documents/[id]/print.vue)
- document e-mail sending with PDF attachment: [`app/pages/documents/[id]/index.vue`](./app/pages/documents/[id]/index.vue) via [`server/api/documents/[id]/email.post.ts`](./server/api/documents/[id]/email.post.ts)

Important POS UI components:

- [`app/components/pos/CustomerForm.vue`](./app/components/pos/CustomerForm.vue)
- [`app/components/pos/CatalogItemForm.vue`](./app/components/pos/CatalogItemForm.vue)
- [`app/components/pos/TicketForm.vue`](./app/components/pos/TicketForm.vue)
- [`app/components/pos/DocumentEditor.vue`](./app/components/pos/DocumentEditor.vue)
- [`app/components/pos/DocumentContextFields.vue`](./app/components/pos/DocumentContextFields.vue)
- [`app/components/pos/DocumentLinesEditor.vue`](./app/components/pos/DocumentLinesEditor.vue)
- [`app/components/pos/DocumentPaymentSlideover.vue`](./app/components/pos/DocumentPaymentSlideover.vue)
- [`app/components/pos/CustomerSelectField.vue`](./app/components/pos/CustomerSelectField.vue)
- [`app/components/pos/BarcodeScanner.client.vue`](./app/components/pos/BarcodeScanner.client.vue)
- [`app/components/pos/SummaryCard.vue`](./app/components/pos/SummaryCard.vue)

Important composables:

- [`app/composables/useDocumentDraft.ts`](./app/composables/useDocumentDraft.ts)
- [`app/composables/useBarcodeScanner.ts`](./app/composables/useBarcodeScanner.ts)
- [`app/composables/useDashboard.ts`](./app/composables/useDashboard.ts)

The default dashboard navigation is defined in [`app/layouts/default.vue`](./app/layouts/default.vue).

## End-Of-Day Reporting

The daily report is designed for quick store closing checks.

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
- if you change server routes, Nitro behavior, or Cloudflare Worker-sensitive logic, run `npm run build`
