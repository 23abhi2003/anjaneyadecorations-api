-- Run against DB:
-- wrangler d1 execute anjaneya-db --remote --file=./migrate_add_auto_rentals.sql
-- or for local dev:
-- wrangler d1 execute anjaneya-db --local --file=./migrate_add_auto_rentals.sql

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
  id              TEXT PRIMARY KEY,
  driver_name     TEXT NOT NULL DEFAULT '',
  amount          TEXT NOT NULL DEFAULT '0',
  date            TEXT NOT NULL DEFAULT '',
  payment_status  TEXT NOT NULL DEFAULT 'due',
  reason          TEXT NOT NULL DEFAULT '',
  data            TEXT NOT NULL,
  inserted_at     INTEGER NOT NULL DEFAULT (unixepoch())
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
