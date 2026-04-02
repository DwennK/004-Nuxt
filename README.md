# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

Nuxt 4 POS and shop-management app for a physical tech store.

The project is built for day-to-day in-store operations with a pragmatic business split between:

- repair and tracked service tickets
- direct sales
- commercial documents
- payments and cashflow
- daily closing checks

It uses Nuxt server routes, Drizzle ORM, and Turso/libSQL, and is deployed through Nitro to Cloudflare Workers.

## What The App Covers

Primary POS scope:

- customers
- catalog items
- direct sales
- repair / service tickets
- commercial documents
- document lines
- payments
- end-of-day reporting

Secondary modules still present in the repo:

- smartphone stock management
- smartphone reservation flows
- inbox / notifications / settings pages

## Core Business Model

The project follows these rules:

- a `ticket` is an operational work case: repair, diagnostic, follow-up support, or any tracked intervention
- a `document` is the commercial object: quote, customer order, invoice, receipt
- a `payment` is the cashflow object and is tracked separately from tickets and documents
- direct sales can happen without a ticket
- quick support can happen without a ticket when there is no follow-up workflow

Typical flows:

- tracked repair: `Ticket -> Quote -> Invoice -> Payment -> Ticket closed`
- customer order: `Ticket or direct context -> Customer order -> Invoice -> Payment`
- direct sale: `Quick sale -> Receipt or invoice -> Payment`
- quick support: `Invoice or receipt -> Payment`

## Current Operator Flows

Main routes used in daily operations:

- dashboard: [`app/pages/index.vue`](./app/pages/index.vue)
- quick sale: [`app/pages/sales/new.vue`](./app/pages/sales/new.vue)
- tickets: [`app/pages/tickets/index.vue`](./app/pages/tickets/index.vue)
- ticket detail: [`app/pages/tickets/[id].vue`](./app/pages/tickets/[id].vue)
- documents: [`app/pages/documents/index.vue`](./app/pages/documents/index.vue)
- document creation: [`app/pages/documents/new.vue`](./app/pages/documents/new.vue)
- document detail / inline editing: [`app/pages/documents/[id]/index.vue`](./app/pages/documents/[id]/index.vue)
- document printing: [`app/pages/documents/[id]/print.vue`](./app/pages/documents/[id]/print.vue)
- payments: [`app/pages/payments/index.vue`](./app/pages/payments/index.vue)
- daily report: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

Current UX direction:

- `sales/new` is the fast operator flow for direct sales
- `tickets` is the tracked repair / service flow
- document detail is now a lines-first workspace with inline editing for the document and its lines
- payments remain a separate object and screen, even when attached to a document

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

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Run the dev server:

```bash
npm run dev
```

Then open the main POS flows:

- `/sales/new`
- `/tickets`
- `/documents`
- `/payments`

## Environment Variables

Defined in [`.env.example`](./.env.example):

```bash
NUXT_PUBLIC_SITE_URL=
TURSO_URL=
TURSO_TOKEN=
```

- `NUXT_PUBLIC_SITE_URL`: public site URL
- `TURSO_URL`: Turso database URL
- `TURSO_TOKEN`: Turso auth token

## Useful Scripts

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

1. `npm run dev`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build` when changing app wiring, server routes, or deployment-sensitive behavior

## Data And POS Rules

Key implementation details:

- money is stored as integer cents
- catalog and document pricing is handled as TTC / VAT-inclusive amounts
- VAT is stored at both line and document level for reporting and print output
- document line quantity is stored as an integer
- ticket numbers and document numbers are generated server-side
- customer, ticket, document, and payment types are centralized in the shared POS layer
- the POS bootstrap includes compatibility logic for older customer table shapes
- sample data is bootstrapped on first POS access

Main tables:

- `customers`
- `catalog_items`
- `tickets`
- `documents`
- `document_lines`
- `payments`

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

Other app routes also exist for:

- company settings
- members / notifications demo endpoints
- Swiss postal code lookup
- smartphone stock and reservation flows

## Frontend Structure

Main app pages:

```text
app/pages/
  index.vue
  sales/
    new.vue
  customers/
    index.vue
    new.vue
    [id].vue
  catalog/
    index.vue
    new.vue
    [id].vue
  tickets/
    index.vue
    new.vue
    [id].vue
  documents/
    index.vue
    new.vue
    [id]/index.vue
    [id]/print.vue
  payments/
    index.vue
  reports/
    daily.vue
```

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

The default dashboard navigation is defined in [`app/layouts/default.vue`](./app/layouts/default.vue).

## End-Of-Day Reporting

The daily report is designed for quick store closing checks.

Current output includes:

- total paid today
- invoices and receipts paid today
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

Notes:

- use the provided npm scripts instead of calling `wrangler deploy` from the repo root directly
- deployment goes through `.output`
- if you change the data model, update [`server/db/schema.ts`](./server/db/schema.ts) first, then run `npm run db:push`
- if you change server routes, Nitro or Worker-sensitive behavior, run `npm run build`

