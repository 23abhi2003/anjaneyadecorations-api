-- Run this ONCE against an already-deployed DB that predates the `pin` column.
-- (A brand new DB created from schema.sql already has this column — skip this file.)
-- wrangler d1 execute anjaneya-db --remote --file=./migrate_add_pin.sql
ALTER TABLE staff ADD COLUMN pin TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_staff_phone ON staff(phone);
