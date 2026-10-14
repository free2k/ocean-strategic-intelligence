-- Derived registry only. Does not alter original entities, confirmations or articles.
BEGIN;
ALTER TABLE ocean_research.records DROP CONSTRAINT IF EXISTS records_kind_check;
ALTER TABLE ocean_research.records ADD CONSTRAINT records_kind_check CHECK(kind IN ('snapshot','batch','release','product','registry'));
COMMIT;
