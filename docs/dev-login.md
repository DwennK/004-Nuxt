# Development Login

Temporary POS login for pre-live development:

- Email: `test@live.fr`
- Password: `test`

Create or refresh the account with:

```bash
npm run seed:test-user
```

The seed command is idempotent. It updates the test account password and reactivates it if the email already exists.
It also grants the temporary account administrator rights so user-management and integration-setup screens remain accessible in development.

This account is for development and staging only. Remove or disable it before production launch.
