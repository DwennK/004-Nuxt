# Database migrations

The restored Microwest database was introspected and baselined on 2026-09-02
through the procedure in
[`docs/database-migrations.md`](../docs/database-migrations.md).

- `20260902155258_talented_songbird` is the exact adoption baseline generated
  from the restored database with `drizzle-kit pull --init`. Its commented SQL
  records the existing 17 tables without recreating them.
- `20260902155313_pos_counter_and_email_journal` adds `counter_customer`,
  `sent_emails`, `sent_email_events`, and their indexes. It leaves existing data
  and tables intact. The SQL was rehearsed on a remote clone and a fresh local
  restoration, with clean verification and zero pending migrations on rerun.

The `users.is_admin` default is expressed as SQL `0` in the application schema
to preserve the existing SQLite default and avoid an unnecessary table rebuild.

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

Local status verifies the committed migration inventory. Remote status must
also confirm that the target database ledger matches these exact migrations;
the old database has not been baselined or migrated by this restoration.

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
