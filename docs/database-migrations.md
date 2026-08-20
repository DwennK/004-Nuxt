# Database migration runbook

## Purpose

Legacy compatibility DDL remains available in source for local recovery, but it
is disabled by default and no longer runs on the application request path.
`ensurePosSchema()` is therefore a zero-I/O compatibility boundary unless the
explicit local break-glass switch is enabled. Production must use the verified
migration workflow below before deploying the Worker.

The schema contract remains `server/db/schema.ts`. Drizzle migration snapshots
and SQL live in `drizzle/`.

Runtime demo data is disabled by default. `POS_ALLOW_RUNTIME_DEMO_SEED=true`
exists only as a temporary local compatibility switch while the explicit seed
command is extracted. It only has an effect together with
`POS_ALLOW_RUNTIME_SCHEMA_BOOTSTRAP=true`. Never enable either switch against
staging or production.

## Safety model

Database environment and target confirmation are mandatory for every remote
operation. Credentials remain in environment variables and must never be
passed as command-line arguments or committed.

- `TURSO_URL`: database URL.
- `TURSO_TOKEN`: short-lived token appropriate for the operation.
- `DB_REMOTE_TARGETS`: required JSON allowlist mapping every approved remote
  hostname (plus port when present) to `development`, `test`, `staging`, or
  `production`. Remote targets absent from this mapping are always refused.
- `DB_TARGET_ENV`: optional assertion for direct Drizzle commands. It must
  match the environment mapped by `DB_REMOTE_TARGETS`; it is not authoritative.
- `DB_CONFIRM_TARGET`: exact hostname printed by the safe scripts.
- `DB_ALLOW_PRODUCTION_DDL=true`: temporary break-glass acknowledgement for a
  direct Drizzle command against production. Never store it in `.env`.

The safe scripts require equivalent command-line acknowledgements. Production
reads require `--environment production --allow-production-read` and exact
`--confirm-target`. Production migration additionally requires `--apply`,
`--allow-production-write`, and `--backup-reference`.

Use three different Turso credentials:

1. a short-lived read-only token for introspection, status, and verification;
2. a short-lived migration token for the approved migration window;
3. a Worker runtime token without schema add/update/delete permissions after
   runtime DDL has been removed.

## Commands

These files can be wired into package scripts after the current unrelated
manifest work is complete:

```bash
node scripts/db/introspect.mjs --help
node scripts/db/verify.mjs --help
node scripts/db/status.mjs --help
node scripts/db/migrate-safe.mjs --help
node scripts/db/backfill-document-totals.mjs --help
```

Local SQLite example:

```bash
TURSO_URL=file:/absolute/path/pos.db node scripts/db/introspect.mjs --include-counts
TURSO_URL=file:/absolute/path/pos.db node scripts/db/verify.mjs
TURSO_URL=file:/absolute/path/pos.db node scripts/db/status.mjs
TURSO_URL=file:/absolute/path/pos.db node scripts/db/migrate-safe.mjs
```

`migrate-safe` only prints a plan unless `--apply` is present. The document
total backfill follows the same rule and replaces the former unbounded
recalculation during Worker cold starts.

The totals backfill uses an ID cursor and bounded transactions. One invocation
scans at most `--batch-size × --max-batches` documents and submits updates only
for mismatches in each window; defaults are 100 documents per transaction and
10 transactions. Resume an incomplete run with the reported `nextAfterId`,
then finish with a fresh plan from cursor zero to catch rows that may have
changed concurrently:

```bash
TURSO_URL=file:/absolute/path/pos.db node scripts/db/backfill-document-totals.mjs \
  --batch-size 100 --max-batches 10
TURSO_URL=file:/absolute/path/pos.db node scripts/db/backfill-document-totals.mjs \
  --apply --batch-size 100 --max-batches 10 --after-id 0
```

Each update rechecks the mismatch predicate and recomputes from the current
lines inside its transaction. A completed run must report zero remaining
mismatches, and the following apply pass must report zero updates.

`verify.mjs` derives the expected schema contract from `server/db/schema.ts`.
It fails on missing or unexpected columns, column type/nullability/primary-key
drift, named index order or uniqueness drift, and foreign-key/action drift.

Remote read-only example, after obtaining a short-lived read-only token:

```bash
DB_REMOTE_TARGETS='{"database-host":"staging"}' \
  TURSO_URL=libsql://database-host TURSO_TOKEN=... \
  node scripts/db/introspect.mjs \
  --environment staging \
  --confirm-target database-host \
  --include-counts
```

Never paste a token into `--confirm-target`; that value is only the database
hostname.

Keep the reviewed remote-target mapping in the protected operator environment.
Do not construct or relabel it ad hoc in the migration command: the CLI label
is checked against the mapping and cannot downgrade a mapped production host.

## First production baseline

Baseline creation mutates production migration metadata and therefore requires
its own explicit authorization. Do not perform it during a read-only audit.

### 1. Read-only inventory

1. Record UTC timestamp, Git SHA, active Worker version, Turso database ID, URL
   hostname, size, and region.
2. Create a read-only, database-scoped, expiring token.
3. Run `introspect.mjs --include-counts` and archive its JSON as a release
   artifact.
4. Run `verify.mjs`; every integrity and invariant violation must be explained
   before continuing.
5. Run Drizzle pull **without** `--init` into a temporary directory and compare
   the extracted schema with `server/db/schema.ts`.

Do not assume the TypeScript schema describes production. Runtime migrations
may have produced nullable columns or missing indexes that differ from it.

### 2. Backup and restore rehearsal

1. Save a logical `.dump`.
2. Create a server-side Turso clone of production.
3. Restore the dump into a disposable database.
4. Run `verify.mjs` against the restored database.
5. Record the clone/database reference used for rollback.

A backup is not accepted until its restore has been tested.

### 3. Rehearse the baseline

On the disposable clone, use the installed Drizzle version to run `pull --init`.
It must create the `__drizzle_migrations` ledger and one baseline migration
without replaying the commented baseline DDL over existing tables. Preserve
the exact generated migration folder: its hash is written to the ledger.

That introspection baseline is adoption-only because its DDL is commented. It
must not be used to provision an empty database. Until an executable bootstrap
artifact is designed and rehearsed separately, local empty databases use the
local-only push workflow and disaster recovery uses the verified dump/clone.
`migrate-safe` detects and refuses an adoption-only baseline on an empty DB.

Generate the next migration from `server/db/schema.ts`. This is the explicit
reconciliation migration between real production shape and desired shape.
Review every statement, especially table rebuilds, drops, nullability changes,
unique indexes, and data backfills.

Run the exact sequence twice on a fresh clone. The second pass must report zero
pending migrations.

### 4. Authorized production baseline

1. Enter the approved low-traffic or write-freeze window.
2. Reconfirm target hostname and backup reference.
3. Repeat the read-only verification and compare counts/signatures with the
   rehearsal input.
4. Run the exact reviewed `pull --init` operation once with a short-lived
   migration token.
5. Preserve and commit the exact migration folder produced by that operation.
6. Apply only the reviewed reconciliation migration through
   `migrate-safe.mjs --apply`.
7. Run `status.mjs`, `verify.mjs`, then run the migration plan again. Status
   must converge and the second plan must contain zero pending migrations.

## Normal migration workflow

Use expand/backfill/switch/cleanup across separate releases:

1. **Expand:** add compatible nullable columns, tables, and indexes.
2. **Backfill:** run an idempotent, resumable, separately reviewed data job.
3. **Switch:** deploy code that reads the new representation. Use dual-write or
   a feature flag when old and new Workers can overlap.
4. **Cleanup:** remove legacy structures only after the rollback window.

For each schema change:

1. edit `server/db/schema.ts`;
2. generate a named migration;
3. inspect the SQL and snapshot;
4. run Drizzle migration checks;
5. migrate a fresh database and a restored production clone;
6. run lint, typecheck, security regression, build, Worker preview, status, and
   DB verification;
7. commit schema and migration together.

`drizzle-kit push` is forbidden for staging and production because it has no
reviewed release ledger and can approve destructive drift directly.

## Deployment gate

The database expands before the Worker is deployed. The old and new Worker
must both support the post-migration schema.

1. Record the current Worker version ID.
2. Apply additive migrations.
3. Verify database integrity and invariants.
4. Upload the new Worker version without immediately replacing all traffic.
5. Smoke-test the new version.
6. Promote gradually only while errors, latency, and business totals remain
   stable.
7. Reach 100%, run verification again, then revoke the migration token.

Do not combine a destructive cleanup with the application switch.

## Rollback

- Additive migration failure: roll back the Worker and leave added structures
  in place.
- Switch failure: disable the new read path, then roll back the Worker.
- Never run an automatic destructive down migration.
- Database corruption: freeze writes, restore to a new Turso database from the
  verified clone/dump/PITR, run verification, create a new runtime token, point
  Worker configuration to the restored database, and redeploy.

Rolling back a Cloudflare Worker does not restore an external Turso database.

## Go / no-go

GO only when:

- the baseline came from the real database;
- backup restore was tested;
- rehearsal succeeded twice and the second pass was empty;
- integrity, foreign keys, and business invariants are clean;
- both Worker versions accept the migrated schema;
- no implicit seed or normalization is part of the request path;
- exact Worker rollback version and Turso recovery reference are recorded.

NO-GO when:

- production drift is unexplained;
- unique constraints have duplicate candidates;
- a backup has not been restored;
- a backfill is unbounded or non-resumable;
- a destructive migration shares the switch release;
- `db:push` or runtime DDL is still the only deployment mechanism;
- the previous Worker cannot run against the migrated schema.
