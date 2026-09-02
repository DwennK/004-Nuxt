# API contracts

## Financial mutation idempotency

The following routes require an `Idempotency-Key` request header:

- `POST /api/sales/create-and-pay`
- `POST /api/documents`
- `POST /api/documents/:id/mark-paid`
- `POST /api/payments`
- `POST /api/tickets/:id/quote`
- `POST /api/tickets/:id/order`
- `POST /api/tickets/:id/invoice`

Use a UUID or another opaque key containing 8 to 200 ASCII letters, digits,
dots, underscores, colons, or hyphens. A retry of the same logical operation
must reuse both the key and the exact validated payload. `issuedAt` and
`paidAt` are required ISO timestamps rather than server-generated defaults so
that a byte-for-byte logical retry remains stable. The server returns the
original resource and does not create a second document or payment.

Reusing a key with a different payload returns `409` with
`IDEMPOTENCY_PAYLOAD_MISMATCH`. A missing key returns `428` with
`IDEMPOTENCY_KEY_REQUIRED`; an invalid key returns `400`.

The first-party UI keeps the key and the timestamped request body together
until a successful response. External clients must do the same before moving
to this branch.

Receipts are inserted in the same database transaction as the financial
mutation. A rollback therefore leaves neither business rows nor a receipt.

## Quick-sale walk-in customer

`POST /api/sales/create-and-pay` accepts an explicit `document.customerId: null`
for a sale without a named customer or ticket. Existing numeric customer IDs
keep their meaning; omitting the field or using null with a ticket is rejected.
Keep null in the retry payload: the server resolves the customer only inside
the idempotent financial transaction, together with the invoice and payment.

The singleton `counter_customer` row pins the selected customer ID even if the
customer's name changes. First use adopts the oldest matching legacy walk-in
customer across the database, or creates one. It never merges or removes
existing duplicates. Its foreign key prevents deleting the assigned customer.

Deployment requires the additive `counter_customer` table BEFORE switching the
Worker. `docs/sql/counter-customer-additive.sql` is a local/rehearsal candidate,
not a production migration. Follow `docs/database-migrations.md`: adopt the
real baseline, generate/review the reconciliation migration, rehearse it and
verify the target before an authorized remote apply. Leave the table in place
on Worker rollback. Never create it implicitly in a production request.

## Payment list pagination

`GET /api/payments` returns the shared pagination envelope:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 50,
  "total": 0
}
```

Supported page sizes are 1 through 250. The first-party payment list and
customer detail consumers use this contract. External consumers that expected
the former bare array must migrate before deploying this branch.
