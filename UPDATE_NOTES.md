# What changed in this update

## 1. Real login for Owner + Staff (token-based)
- `POST /api/auth/login` — body `{ role: "owner" | "staff", phone, pin }`.
  - Owner credentials come from `OWNER_PHONE` / `OWNER_PIN` in `wrangler.toml`
    (defaults to **7416411182 / 1182** — change these, or better, set them as
    Cloudflare secrets instead of plain vars).
  - Staff credentials are looked up in the `staff` table by phone number, then
    checked against that staff member's `pin`.
  - Returns `{ token, user }`. `token` is a signed (HMAC-SHA256), 30-day
    token — see `src/auth.ts`.
- `GET /api/auth/verify` — send `Authorization: Bearer <token>`, returns the
  decoded `{ user }` or 401. Used by the frontend for the `?token=...`
  auto-login deep link (requirement #4) and to restore a session.
- Every other `/api/*` route now requires a valid bearer token.
- Set a real `AUTH_SECRET` in production: `wrangler secret put AUTH_SECRET`.

## 2. Role-based data protection
- Staff logins **never receive invoice/amount data** from the API — `GET
  /api/orders`, `GET /api/orders/:id`, and `GET /api/customers/:id/orders`
  strip the `invoice` object down to blanks when the caller's token role is
  `staff`. This is enforced server-side, not just hidden in the UI.
- `PUT /api/orders/:id` silently drops any `invoice` or
  `paymentCompletionStatus` fields in the request body if the caller is
  staff — so a modified request can't sneak invoice edits through.
- `DELETE /api/orders/:id` is owner-only (403 for staff).
- `POST /api/staff` (adding new staff) is owner-only.
- `PUT /api/staff/:id` — the owner can edit anyone; a staff member can only
  edit their own profile (name/phone/PIN).

## 3. Order + payment completion status (requirement #5)
- `Order` now has two independent flags:
  - `orderCompletionStatus`: `"pending" | "completed"` — has the physical
    tent/decoration work been done? Either role can set this.
  - `paymentCompletionStatus`: `"pending" | "completed"` — has the invoice
    been paid in full? **Owner only.**
- The overall `status` field (`pending | confirmed | completed`) is now
  **computed server-side** on every create/update: it's only `"completed"`
  once *both* flags are `"completed"`.

## 4. Customers auto-created from orders (requirement #2)
- After every `POST /api/orders` and `PUT /api/orders/:id`,
  `ensureCustomerFromOrder()` runs: if no existing customer matches the
  order's customer phone (or name, if no phone was given), a new Customer
  row is inserted automatically. No more manual double-entry on the
  Customers page.
- New: `GET /api/customers/:id/orders` — returns every order for a given
  customer (matched by phone, falling back to name). The frontend's
  "search past customers" step in the order wizard already expected this
  endpoint; it's now implemented.

## 5. Staff phone + PIN (requirement #6)
- `staff` table has a new `pin` column (4-digit login PIN). Run the schema
  migration below if you have an existing deployed DB.
- `StaffMember` records now carry `phone` + `pin`; PINs are **never**
  returned by `GET /api/staff` or `GET /api/staff/:id` — write-only.
- `PUT /api/staff/:id` lets you update `name` / `phone` / `pin` (send `pin`
  only when you want to change it).

## Setup / migration

```bash
npm install

# Brand-new DB:
npm run db:migrate:local    # or :remote
npm run db:seed:local       # or :remote

# Already-deployed DB (just adding the `pin` column):
wrangler d1 execute anjaneya-db --remote --file=./migrate_add_pin.sql

# Secrets (recommended over plain [vars] in wrangler.toml for production):
wrangler secret put AUTH_SECRET
wrangler secret put OWNER_PHONE
wrangler secret put OWNER_PIN

npm run deploy
```

After deploying, log in as Owner (7416411182 / 1182 by default), go to
**Staff**, and give each staff member a phone number + PIN via **Edit** —
seeded staff have no phone/PIN set yet, so they can't log in until you do.
