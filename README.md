# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

Nuxt 4 shop management / POS app for a physical tech store. The current implementation is built around a simple, production-friendly architecture for:

- smartphone repair
- smartphone sales
- computer / tech support services
- accessories sales

The app uses Nuxt server routes, Drizzle ORM, and Turso/libSQL with a clear separation between workflow, commercial documents, and cashflow.

## Current Scope

Primary POS domain implemented:

- `customers`
- `catalog_items`
- `tickets`
- `documents`
- `document_lines`
- `payments`
- end-of-day reporting

Still present in the repo as older/secondary modules:

- smartphone stock management
- smartphone reservation requests
- inbox / notifications / settings demo pages

## Core Business Model

The project follows these rules:

- a `ticket` is only for tracked work cases: repairs, diagnostics, follow-up support, or any case where the device is kept by the store
- a `document` is the commercial object: quote, customer order, invoice, receipt
- a `payment` is the cashflow object and is tracked separately
- direct accessory sales do not require a ticket
- quick support services do not require a ticket if there is no follow-up

Typical flows:

- tracked repair: `Ticket -> Quote -> Invoice -> Payment -> Ticket closed`
- direct sale: `Receipt/Invoice -> Payment`
- quick support: `Invoice/Receipt -> Payment`

## Stack

- `Nuxt 4`
- `Vue 3`
- `TypeScript`
- `@nuxt/ui`
- `Drizzle ORM`
- `drizzle-kit`
- `@libsql/client`
- `Turso` / `libSQL`
- `Tailwind CSS`
- `Zod`
- `Cloudflare Workers` via Nitro

## Database

Key files:

- schema: [`server/db/schema.ts`](./server/db/schema.ts)
- drizzle config: [`drizzle.config.ts`](./drizzle.config.ts)
- Turso/Drizzle connection: [`server/utils/turso.ts`](./server/utils/turso.ts)
- POS bootstrap, migration, numbering, seed data: [`server/utils/pos/core.ts`](./server/utils/pos/core.ts)

Main tables:

- `customers`
- `catalog_items`
- `tickets`
- `documents`
- `document_lines`
- `payments`

Notable implementation details:

- money is stored as integer cents
- catalog and document prices are handled as TTC / VAT-inclusive amounts
- VAT is stored separately per line and per document for reporting and print output
- document line quantity is validated and stored as a whole number integer
- ticket numbers and document numbers are generated server-side
- the POS bootstrap includes compatibility logic for the older customer table shape
- seed data creates sample customers, catalog items, one repair ticket, one accessory sale, and one quick support sale

## Indexing

The schema includes indexes for the operational lookups that matter most in-store:

- customer search: last name, phone, email
- ticket lookup: ticket number, customer, status, opened date
- document lookup: document number, customer, ticket, type, status, issued date
- payment reporting: document, paid date, method, status
- category reporting support: document lines by document and category hint

## Shared POS Layer

Shared constants, types, helpers, and validation are centralized here:

- constants: [`shared/constants/pos.ts`](./shared/constants/pos.ts)
- types: [`shared/types/pos.ts`](./shared/types/pos.ts)
- utilities: [`shared/utils/pos.ts`](./shared/utils/pos.ts)
- validation schemas: [`shared/validation/pos.ts`](./shared/validation/pos.ts)

This keeps enums and business vocabulary aligned across pages, server routes, and database code.

## Server Structure

POS services:

- [`server/utils/pos/customers.ts`](./server/utils/pos/customers.ts)
- [`server/utils/pos/catalog.ts`](./server/utils/pos/catalog.ts)
- [`server/utils/pos/tickets.ts`](./server/utils/pos/tickets.ts)
- [`server/utils/pos/documents.ts`](./server/utils/pos/documents.ts)
- [`server/utils/pos/payments.ts`](./server/utils/pos/payments.ts)
- [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)

POS API routes:

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

## Frontend Structure

Main POS pages:

```text
app/pages/
  index.vue
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
    [id].vue
    [id]/print.vue
  payments/
    index.vue
  reports/
    daily.vue
```

Reusable POS UI components:

- [`app/components/pos/CustomerForm.vue`](./app/components/pos/CustomerForm.vue)
- [`app/components/pos/CatalogItemForm.vue`](./app/components/pos/CatalogItemForm.vue)
- [`app/components/pos/TicketForm.vue`](./app/components/pos/TicketForm.vue)
- [`app/components/pos/DocumentEditor.vue`](./app/components/pos/DocumentEditor.vue)
- [`app/components/pos/SummaryCard.vue`](./app/components/pos/SummaryCard.vue)

The default dashboard navigation has been updated in [`app/layouts/default.vue`](./app/layouts/default.vue) to make the POS flows the primary app navigation.

## End-Of-Day Reporting

The daily report endpoint and page are designed for quick store closing checks.

Current output includes:

- total paid today
- list of paid invoices and receipts today
- totals by payment method
- number of open tickets
- number of tickets opened today
- number of tickets closed today
- turnover split by document line category when available

Relevant files:

- API: [`server/api/reports/end-of-day.get.ts`](./server/api/reports/end-of-day.get.ts)
- service: [`server/utils/pos/reports.ts`](./server/utils/pos/reports.ts)
- page: [`app/pages/reports/daily.vue`](./app/pages/reports/daily.vue)

## Installation

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

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

## Development

Run the Nuxt dev server:

```bash
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
```

## Drizzle

Push the schema to Turso:

```bash
npm run db:push
```

Open Drizzle Studio:

```bash
npm run db:studio
```

## Cloudflare / Nitro

The app uses the `cloudflare_module` Nitro preset configured in [`nuxt.config.ts`](./nuxt.config.ts).

Build:

```bash
npm run build
```

Preview locally:

```bash
npm run preview
```

Deploy:

```bash
npm run deploy
```

Generate Cloudflare types:

```bash
npm run cf-typegen
```

## Notes

- do not run `wrangler deploy` from the repo root directly; use the provided npm scripts
- deployment goes through `.output`
- if you change the data model, update [`server/db/schema.ts`](./server/db/schema.ts) first, then run `npm run db:push`
- the app currently bootstraps some data automatically on first POS access via the POS core bootstrap
