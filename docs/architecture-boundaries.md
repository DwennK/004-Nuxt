# Architecture boundaries

The repository follows this dependency direction:

```text
app ──────┐
          ├──> shared
server ───┘
```

- `shared/` contains runtime-neutral contracts, validation, constants, and pure utilities used by both application and server code. It must not import from `app/` or `server/`.
- `server/` owns persistence, integrations, and server-only business orchestration. It may import from `shared/`, but it must not import from `app/` through `~/...` or `@/...` aliases.
- `app/` owns Vue pages, components, composables, and presentation-only types. It may consume contracts and pure utilities from `shared/`.
- Cross-boundary request and response shapes belong in `shared/types/`; shared runtime validation belongs in `shared/validation/`.

`app/types/index.d.ts` temporarily re-exports smartphone contracts from `shared/types/smartphones.ts` so existing application imports keep working while consumers migrate incrementally. New smartphone imports should use `~~/shared/types/smartphones` directly.

The scoped ESLint rule `project/server-import-boundaries` prevents new static imports from `server/` to the application aliases. A repository check for any remaining server-to-app imports is:

```sh
rg -n "(from|import\\()\\s*['\"](?:~|@)/" server
```

## POS ownership

The former `server/utils/pos/core.ts` module has been removed. Import directly
from the owner rather than recreating a general-purpose barrel:

- `pos/schema.ts`: zero-I/O bootstrap gate, disabled by default.
- `server/legacy/pos-bootstrap.ts`: historical local recovery DDL and demo seed,
  loaded dynamically only after the explicit bootstrap gate.
- `pos/numbers.ts`: atomic ticket and document numbering.
- `pos/ticket-events.ts` and `pos/ticket-status.ts`: ticket history and transitions.
- `pos/document-balances.ts`: payment totals and derived document status.
- `pos/payment-writes.ts`: shared manual payment policy, insertion and history;
  receives the caller's transaction, never starts a second one.
- `shared/domain/commercial/money.ts`, `shared/lib/text.ts`, and
  `server/modules/customers/mapper.ts`: direct imports for calculations, text and mapping.

Compatibility DDL is retained until the real database baseline and migration
workflow are verified. Moving it does not authorize production bootstrap,
remove the migration gate, or change Shopify import reconciliation.

Commercial UI drafts store `unitPriceCents`; inputs display francs and API
payloads keep the existing integer-cent `unitPrice` contract. Refreshes only
replace clean drafts within the same record. Saving explicitly acknowledges
the submitted snapshot, preserving edits made while the request is in flight.
