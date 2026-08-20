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
