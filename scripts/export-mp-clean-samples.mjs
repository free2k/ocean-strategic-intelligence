import fs from 'node:fs/promises';import {pool} from '../server/integrations/mp2rss-store.mjs';
try{const rows=(await pool.query("SELECT payload,classification FROM mp2rss.items WHERE subscription_id='mp:3299105144'")).rows;await fs.writeFile('/opt/knowledge-base/mp-clean-samples.json',JSON.stringify(rows));console.log(rows[2].payload.content.slice(-4500));}finally{await pool.end();}
