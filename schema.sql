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

CREATE TABLE IF NOT EXISTS investments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '', -- what it was for (free text)
  category    TEXT NOT NULL DEFAULT 'others', -- decoration | tenthouse | lighting | dj | food | flowers | others
  amount      TEXT NOT NULL DEFAULT '0',
  date        TEXT NOT NULL DEFAULT '', -- YYYY-MM-DD
  data        TEXT NOT NULL, -- full Investment JSON
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments(category);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);

CREATE TABLE IF NOT EXISTS auto_rides (
  id              TEXT PRIMARY KEY,
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT NOT NULL DEFAULT '',
  driver_assigned TEXT NOT NULL DEFAULT '',
  date            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'completed',
  payment_status  TEXT NOT NULL DEFAULT 'paid',
  total_amount    TEXT NOT NULL DEFAULT '0',
  advance_paid    TEXT NOT NULL DEFAULT '0',
  due_amount      TEXT NOT NULL DEFAULT '0',
  driver_pay      TEXT NOT NULL DEFAULT '0',
  data            TEXT NOT NULL,
  inserted_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auto_rides_date ON auto_rides(date);
CREATE INDEX IF NOT EXISTS idx_auto_rides_customer ON auto_rides(customer_name);
CREATE INDEX IF NOT EXISTS idx_auto_rides_driver ON auto_rides(driver_assigned);
CREATE INDEX IF NOT EXISTS idx_auto_rides_payment ON auto_rides(payment_status);

CREATE TABLE IF NOT EXISTS auto_diesel (
  id                TEXT PRIMARY KEY,
  date              TEXT NOT NULL DEFAULT '',
  total_amount      TEXT NOT NULL DEFAULT '0',
  litres            TEXT NOT NULL DEFAULT '',
  filled_by_driver  TEXT NOT NULL DEFAULT '',
  data              TEXT NOT NULL,
  inserted_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auto_diesel_date ON auto_diesel(date);
CREATE INDEX IF NOT EXISTS idx_auto_diesel_driver ON auto_diesel(filled_by_driver);

CREATE TABLE IF NOT EXISTS auto_driver_payouts (
  id          TEXT PRIMARY KEY,
  driver_name TEXT NOT NULL DEFAULT '',
  amount      TEXT NOT NULL DEFAULT '0',
  date        TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL,
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auto_payouts_driver ON auto_driver_payouts(driver_name);
CREATE INDEX IF NOT EXISTS idx_auto_payouts_date ON auto_driver_payouts(date);

CREATE TABLE IF NOT EXISTS auto_driver_borrows (
  id             TEXT PRIMARY KEY,
  driver_name    TEXT NOT NULL DEFAULT '',
  amount         TEXT NOT NULL DEFAULT '0',
  date           TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'due',
  reason         TEXT NOT NULL DEFAULT '',
  data           TEXT NOT NULL,
  inserted_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auto_borrows_driver ON auto_driver_borrows(driver_name);
CREATE INDEX IF NOT EXISTS idx_auto_borrows_date ON auto_driver_borrows(date);

CREATE TABLE IF NOT EXISTS auto_drivers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  pin         TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL,
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_auto_drivers_name ON auto_drivers(name);
