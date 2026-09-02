-- REVIEW CANDIDATE / LOCAL TEST FIXTURE, NOT AN APPROVED PRODUCTION MIGRATION.
-- Generate the versioned Drizzle migration only after adopting the REAL baseline.
-- See docs/database-migrations.md and docs/cloudflare-email.md.
CREATE TABLE sent_emails (
  id TEXT PRIMARY KEY NOT NULL,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_addresses TEXT NOT NULL,
  reply_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  attachments TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX sent_emails_idempotency_idx ON sent_emails(idempotency_key);
CREATE UNIQUE INDEX sent_emails_provider_idx ON sent_emails(provider_message_id);
CREATE INDEX sent_emails_created_idx ON sent_emails(created_at, id);
CREATE INDEX sent_emails_document_idx ON sent_emails(document_id);
CREATE TABLE sent_email_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider_message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sent_email_events_message_idx ON sent_email_events(provider_message_id, occurred_at);
