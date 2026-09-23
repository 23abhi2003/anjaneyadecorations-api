-- Run this ONCE against an already-deployed DB that predates the `investments` table.
-- (A brand new DB created from schema.sql already has this table — skip this file.)
-- wrangler d1 execute anjaneya-db --remote --file=./migrate_add_investments.sql
CREATE TABLE IF NOT EXISTS investments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'others',
  amount      TEXT NOT NULL DEFAULT '0',
  date        TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL,
  inserted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments(category);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
