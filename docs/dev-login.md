# Development Login

Temporary POS login for pre-live development:

- Email: `test@live.fr`
- Password: `test`

Create or refresh the account with:

```bash
npm run seed:test-user -- --url file:./test.db
```

The seed command is idempotent. It updates the test account password and reactivates it if the email already exists.
It also grants the temporary account administrator rights so user-management and integration-setup screens remain accessible in development.

The database must already have the application schema. An explicit local URL is
required unless the configured target is selected with `--environment test`.
For a remote test database, also pass `--confirm-target <host>` and declare that
host as `test` in `DB_REMOTE_TARGETS`. Production and staging targets are rejected
by this temporary-account command. Use the administrator seed for real accounts.
