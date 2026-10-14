-- Additive derived schema only. Apply explicitly after isolated PostgreSQL verification.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ocean_research;
CREATE TABLE IF NOT EXISTS ocean_research.records (
 sequence bigserial UNIQUE NOT NULL,
 id text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('snapshot','batch','release')),
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_release_snapshot ON ocean_research.records ((payload->>'snapshotId'),sequence DESC) WHERE kind='release';
CREATE TABLE IF NOT EXISTS ocean_research.head (
 id text PRIMARY KEY CHECK(id='latest'),
 payload jsonb NOT NULL
);
COMMIT;
