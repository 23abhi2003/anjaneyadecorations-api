# Anjaneya Decorations — Backend (Cloudflare Worker + D1)

REST API for the Anjaneya Decorations order-management app, running on
Cloudflare Workers with a D1 (SQLite) database. It's a drop-in replacement
for the old Next.js `app/api/*` routes that used to read/write `data/*.json`
on disk — same request/response shapes, so the frontend barely had to change.

Built with [Hono](https://hono.dev/).

## Endpoints

- `GET  /api/orders` / `POST /api/orders`
- `GET  /api/orders/:id` / `PUT /api/orders/:id` / `DELETE /api/orders/:id`
- `GET  /api/customers` / `POST /api/customers`
- `GET  /api/staff` / `POST /api/staff`

## 1. Install

```bash
npm install
```

## 2. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create anjaneya-db
```

This prints a `database_id` — paste it into `wrangler.toml` in place of
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

## 3. Create tables

```bash
npm run db:migrate:local    # for local dev (wrangler dev)
npm run db:migrate:remote   # for the real, deployed database
```

## 4. (Optional) Load the shop's existing data

`seed.sql` was generated from the project's original `data/orders.json`,
`data/customers.json`, and `data/staff.json`, so you don't lose the
existing orders/customers/staff when you migrate off the file-based store.

```bash
npm run db:seed:local
npm run db:seed:remote
```

Skip this if you'd rather start with an empty database.

## 5. Run locally

```bash
npm run dev
```

This starts the Worker at `http://localhost:8787` with a local D1
(SQLite file under `.wrangler/`).

## 6. Deploy

```bash
npm run deploy
```

Wrangler prints your Worker's URL, e.g.
`https://anjaneya-backend.<your-subdomain>.workers.dev`. Use that as
`NEXT_PUBLIC_API_URL` when building/deploying the frontend.

## CORS

`wrangler.toml` has:

```toml
[vars]
ALLOWED_ORIGINS = "*"
```

Once your Cloudflare Pages frontend is deployed, tighten this to your
actual Pages URL(s), comma-separated, e.g.:

```toml
ALLOWED_ORIGINS = "https://anjaneya-decorations.pages.dev,https://orders.yourdomain.com"
```

Then redeploy (`npm run deploy`).

## Data model

Each table stores the full record as JSON in a `data` column (matching
`lib/types.ts` in the frontend — `Order`, `Customer`, `StaffMember`) plus a
handful of plain columns (`status`, `event_date`, `customer_name`, …) kept
in sync purely so you can query/index on them with SQL later if needed.
See `schema.sql`.
