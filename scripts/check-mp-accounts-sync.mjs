import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 const jobs=(await pool.query("SELECT id,status,created_at,started_at,finished_at,error,result FROM mp2rss.jobs WHERE id=293")).rows;
 console.log(JSON.stringify(jobs.map(j=>({...j,result:{inserted:j.result?.inserted,updated:j.result?.updated,failed:j.result?.failed,streams:j.result?.streams?.length,failures:j.result?.streams?.filter(s=>s.failed)}}))));
 console.log(JSON.stringify((await pool.query("SELECT count(*)::int channels,count(*) FILTER(WHERE posts)::int posts_enabled,count(*) FILTER(WHERE last_sync IS NOT NULL)::int checked FROM mp2rss.subscriptions WHERE present AND payload->'accountLabels' @> '[2]'::jsonb")).rows[0]));
}finally{await pool.end();}
