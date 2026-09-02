# Database migrations

This directory intentionally contains no migration folders until the existing
Turso database has been introspected and baselined through the procedure in
[`docs/database-migrations.md`](../docs/database-migrations.md).

Do not generate an initial migration from an empty database and apply it to the
existing POS database. The first committed migration folder must be the exact
baseline produced from the real database during the separately authorized
baseline operation.

Drizzle's introspection baseline is adoption-only: its DDL is commented out.
It records the existing database shape but cannot provision an empty database.
Until a separately reviewed executable bootstrap artifact exists, create local
databases from `server/db/schema.ts` with the local-only push workflow and use a
verified Turso dump/clone for recovery. `migrate-safe` refuses to apply an
adoption-only baseline to an empty database.

After the baseline exists, every schema change must update
`server/db/schema.ts` and include the generated, reviewed migration folder.
Production uses versioned migrations; `drizzle-kit push` is local-development
only.

Check the committed migration inventory without connecting to any database:

```bash
npm run db:status -- --local-only
```

Until the baseline is committed, this reports `baselineRequired: true` and
exits with code 1. That is an expected missing-baseline signal, not permission
to generate a replacement initial migration.

The safe database commands are exposed through `package.json`:

```bash
npm run db:introspect -- --help
npm run db:verify -- --help
npm run db:status -- --help
npm run db:migrate -- --help
npm run db:backfill:document-totals -- --help
```

Migration and backfill commands are plan-only by default. Applying changes
requires `--apply`; remote targets additionally require the runbook's allowlist
and exact target confirmations. Production writes need separate authorization
and the documented recovery safeguards. SQL candidates under `docs/sql/` are
not a substitute for reviewed, versioned migrations in this directory.
