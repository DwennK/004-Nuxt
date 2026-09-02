-- Local/rehearsal candidate only. NOT an approved production migration.
-- Adopt the real database baseline first, then include this additive table in the
-- reviewed reconciliation migration. Do not deploy anonymous sales before it exists.
CREATE TABLE IF NOT EXISTS counter_customer (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT
);
