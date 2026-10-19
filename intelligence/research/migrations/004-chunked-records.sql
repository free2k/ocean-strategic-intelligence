CREATE TABLE IF NOT EXISTS ocean_research.record_parts (
 record_id text NOT NULL REFERENCES ocean_research.records(id),
 field text NOT NULL,
 part integer NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY(record_id,field,part)
);
CREATE OR REPLACE FUNCTION ocean_research.array_items(record_key text,field_key text,inline_value jsonb)
RETURNS SETOF jsonb LANGUAGE sql STABLE AS $$
 SELECT value FROM (
 SELECT -1 AS part,e.n,e.value FROM jsonb_array_elements(coalesce(inline_value,'[]'::jsonb)) WITH ORDINALITY e(value,n)
 UNION ALL
 SELECT p.part,e.n,e.value FROM ocean_research.record_parts p CROSS JOIN LATERAL jsonb_array_elements(p.payload) WITH ORDINALITY e(value,n)
 WHERE inline_value IS NULL AND p.record_id=record_key AND p.field=field_key
 ) items ORDER BY part,n
$$;
