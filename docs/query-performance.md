# Turso query performance

The September 2026 incident was dominated by document settlement subqueries:
the supplied query snapshot recorded 628 million row reads in 22 executions of
the document summary alone. A result limit does not cap scanned rows, and
batching statements only reduces network round trips.

## Audit coverage and changes

| Area | Result |
| --- | --- |
| Documents, settlement, home, financial reports | Replace repeated correlated payment calculations with shared materialized stages and indexed equality joins. Preserve exact totals, periods and settlement rules. |
| Customers, catalog, tickets, global search | Dedicated suggestion queries omit unused counts and settlement. Full lists retain their totals and search ranking. The internal `/api/search` response is now a smaller lookup shape; its application consumers are updated. |
| Client fetches | Batch filter/page resets into one refresh, cancel superseded fetches, and refresh the affected dossier view. Load report rankings and catalog tables when opened; catalog counters use one grouped summary with independent filters. |
| Smartphone stock and reservations | Server pagination, preserved selection across pages and filters, authenticated SSR, full exports retained. |
| Vacations | One yearly payload built from two batched reads replaces the three overlapping endpoint calls. Original endpoints remain available. |
| Dossier sessions | Remove redundant reads/writes on observation and renewal; keep ownership, heartbeat, lease and transaction checks. |
| Email events and sent history | Avoid full event replay on routine updates, retain duplicate/retry recovery, and select only history fields used by the screen. |
| Assistant | Reject disconnected SQL joins before execution; no hard per-query read budget or remote cancellation guarantee. |
| Imports, seeds, schema and administration | Require explicit test targets for fixture seeding, add eleven indexes, validate expression indexes, provide a Platform API usage command. Existing authentication and business write transactions remain active. |

Client history preloads and barcode scanner behavior are retained where existing
counters or interactions depend on them. Substring searches, exact summaries,
large exports and imports can still read substantial data. The audit does not
turn every operation into a constant-cost query.

## Preserved behavior

- Quotes, orders, invoices and cashflows remain separate objects. Invoice
  settlement includes paid receipts from orders with the same ticket and customer,
  including receipts originally recorded on cancelled orders.
- Cancellation, historical payment edits, negative adjustment lines, zero totals,
  report periods in Europe/Zurich and exact list summaries must retain their
  existing behavior. No stale financial cache is introduced.
- Suggestion endpoints keep the existing substring predicates and ranking. They
  omit list totals and financial calculations that suggestion consumers do not use.
- Smartphone lists retain their existing Unicode search, natural sorting,
  selection and full CSV export. Search and custom sorting may still scan a
  projection of matching candidates. Default pagination returns a bounded page;
  exact counts and deep offsets may still scan additional rows.
- Dossier heartbeat frequency and lease lifetime are unchanged. Authentication,
  concurrency checks and receipt idempotency remain active.
- Assistant SQL remains read-only. Disconnected joins and Cartesian products are
  rejected before execution. This is a resource-protection restriction; the
  application timeout still does not guarantee cancellation of SQL on Turso.

## Index migration

`drizzle/20260911095852_query_read_indexes` adds indexes only. It does not rewrite
financial rows, delete history, alter tables or remove existing indexes. The
schema verifier also validates the normalized-email index expression, rather
than treating all unnamed expressions as equivalent.

Follow `docs/database-migrations.md`: inspect and back up the explicitly selected
target, review the migration plan, apply the versioned migration, then check its
ledger and schema. A successful local build does not apply these indexes to Turso.
Index construction itself consumes reads and writes; account for the migration
separately from steady-state application usage.

## Validation

The regression suites cover business-result equivalence, query shapes, supported
search/ranking, read models, dossier lease behavior, email recovery, seeds, and
client fetch deduplication. Index plans are checked using local libSQL. Financial
query-cost tests use SQLite statement metrics on synthetic datasets to detect
growth in execution work rather than relying on unstable wall-clock thresholds.
These metrics are not Turso's billable row counters.

A subsequent [French page-by-page report](query-reads-comparison.md)
uses the native libSQL `rows_read` counter on the larger local fixture. It models
ten brief visits to each of the 32 screens, including authentication and dossier
departure reads. Its totals are local measurements combined into page scenarios,
not production usage. The CSV stays in docs; the detailed JSON and traces are archived locally outside the repository.

A local before/after benchmark on 2,000 documents and 2,000 payments compared the
old summary SQL/indexes with the current helper/indexes. Both returned 2,000
documents, 627 paid documents and a balance of 2,569,000 cents. SQLite VM work
fell from 107,837,768 to 515,382 instructions (about 209 times less). A single
timing sample fell from 1,167.63 ms to 5.15 ms; neither the timing nor the VM
ratio predicts production billing. Full-scan counters alone are misleading here
because they omit index traversal and count materialized intermediate scans.

Final local checks on 2026-09-11: lint, typecheck, the Cloudflare build,
security regression checks and 590 tests passed, including the final
anonymous-subquery guard regressions added during release review. Browser QA
used an isolated database with 9,852 documents and desktop/mobile viewports
(1440×900 and 390×844). It verified one document filter request with page reset,
the 108.10 CHF invoice / 30 CHF deposit / 78.10 CHF balance, deferred report
rankings, suggestions, all three initial catalog counts, smartphone selection
across pages/filters, and a complete 45-row reservation CSV export. Vacation
calendar and yearly balance show the same five-day absence and remaining leave.
The vacation calendar emits an existing hydration warning, also reproduced with
the exact pre-change page; this unrelated rendering issue remains.

After any changes to settlement, reports, filtering or joins, run the relevant
tests as well as lint, typecheck and build. Verify actual desktop/mobile screens
and fetch counts for changes to loading behavior.

## Usage check

The public Free plan checked on 2026-09-11 includes 500 million row reads and
10 million row writes per month, plus 5 GB storage:
<https://turso.tech/pricing>. Recheck the actual organization's quotas if its
plan changes or it uses a legacy entitlement.

```bash
# Set TURSO_PLATFORM_TOKEN securely in the shell environment beforehand.
npm run db:usage -- --organization your-organization
```

This read-only Platform API command does not run application SQL. It reports
organization totals and available database breakdowns, so usage from other
databases is not mistaken for POS traffic. `TURSO_PLATFORM_TOKEN` is distinct
from the runtime database credential `TURSO_TOKEN`; it is never exposed to the
frontend or accepted as a command-line argument.

Limits can be supplied with `--read-limit` and `--write-limit`. Missing metrics
remain unknown. The month projection assumes a UTC calendar month and a constant
average pace; it is suppressed during the first 24 hours and is not a forecast
guarantee. No scheduler, paid-plan change or POS shutdown is enabled by this
command.

Before claiming the Free quota is sufficient, compare actual daily usage after
deployment against the remaining month and expected number of stations, searches,
reports and imports. Keep a margin for historical growth and other databases.
Optimized queries do not provide an unlimited workload within a finite quota.
Existing consumed quota is not reset by a deployment.

Use the Platform usage/stats APIs for consumption checks, not repeated
`integrity_check`, full exports or financial reports. The latter are useful
validation operations but themselves consume database resources.
