-- Anjaneya Decorations — D1 schema
-- Each table keeps the full record as JSON in `data` (so the rich, nested
-- Order/Customer/StaffMember shapes from lib/types.ts don't need to be
-- pulled apart into columns), plus a few plain columns that are duplicated
-- out of `data` purely so we can filter/sort/search with SQL.

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  event_date    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT NOT NULL,
  seq           INTEGER, -- numeric part of ADVKM-#### for fast "next id" lookups
  data          TEXT NOT NULL, -- full Order JSON
  inserted_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_event_date ON orders(event_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_orders_seq ON orders(seq);

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL, -- full Customer JSON
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS staff (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  pin         TEXT NOT NULL DEFAULT '', -- 4-digit staff login PIN
  data        TEXT NOT NULL, -- full StaffMember JSON (incl. assignments[])
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_staff_name ON staff(name);
CREATE INDEX IF NOT EXISTS idx_staff_phone ON staff(phone);
