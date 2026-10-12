import {pool} from '../server/integrations/mp2rss-store.mjs';
console.log(JSON.stringify((await pool.query("SELECT s.id,s.name,s.fakeid,s.type,a.link,a.author_name,length(a.content) AS body_length FROM sources s JOIN LATERAL (SELECT * FROM articles WHERE source_id=s.id ORDER BY published_at DESC LIMIT 2) a ON true WHERE s.id IN (2,4)")).rows));await pool.end();
