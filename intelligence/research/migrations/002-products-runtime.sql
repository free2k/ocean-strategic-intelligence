-- Additive derived records. Apply only after isolated migration verification.
BEGIN;
ALTER TABLE ocean_research.records DROP CONSTRAINT IF EXISTS records_kind_check;
ALTER TABLE ocean_research.records ADD CONSTRAINT records_kind_check CHECK(kind IN ('snapshot','batch','release','product','registry'));
CREATE TABLE IF NOT EXISTS ocean_research.runtime (
 id text PRIMARY KEY CHECK(id='shared'),
 payload jsonb NOT NULL
);
COMMIT;
