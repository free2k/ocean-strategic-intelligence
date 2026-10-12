import {pool,init} from '../../integrations/mp2rss-store.mjs';
export default defineEventHandler(async()=>{
 await init();
 const local=(await pool.query(`SELECT s.id,s.name,s.alias,s.fakeid,s.is_overseas AS "isOverseas",count(a.id)::int AS count FROM sources s LEFT JOIN articles a ON a.source_id=s.id WHERE s.type='rss' GROUP BY s.id ORDER BY s.id`)).rows;
 const health=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='external-feed-health'")).rows[0]?.payload||{};
 const exists=(await pool.query("SELECT to_regclass('ocean_intel.sources') t")).rows[0].t;
 const external=exists?(await pool.query(`SELECT s.id,s.payload,count(d.id)::int AS count FROM ocean_intel.sources s LEFT JOIN ocean_intel.documents d ON d.payload->>'sourceId'=s.id WHERE s.payload->>'checkedAt' IS NOT NULL AND s.payload->>'method' NOT IN ('api','mp2rss') GROUP BY s.id,s.payload`)).rows:[];
 const byUrl=new Map<string,any>();
 for(const s of local){if(!s.alias)continue;let url;try{url=new URL(s.alias);if(url.hostname==='cn.todayrss.com')continue;}catch{continue;}
  const previous=byUrl.get(url.href);const managed=s.fakeid?.startsWith('oilprice-');
  const row={...s,method:'rss',manager:managed?'oilprice':'rss',status:health[url.href]?.status||'unverified',checkedAt:health[url.href]?.checkedAt,error:health[url.href]?.error};delete row.fakeid;
  if(!previous)byUrl.set(url.href,row);else if(managed)byUrl.set(url.href,{...row,count:row.count+previous.count});else previous.count+=row.count;
 }
 for(const {id,payload:p,count} of external){if(!p.url)continue;let url;try{url=new URL(p.url);if(url.hostname==='cn.todayrss.com')continue;}catch{continue;}
  const previous=byUrl.get(url.href);
  byUrl.set(url.href,{id:'intel:'+id,name:p.name,alias:p.url,sitemap:p.sitemap,sitemapStatus:p.sitemap?health[p.sitemap]?.status:undefined,sitemapCheckedAt:p.sitemap?health[p.sitemap]?.checkedAt:undefined,method:p.method,manager:'intelligence',isOverseas:p.country!=='CN',count,localCount:previous?.count||0,status:p.status||'unverified',checkedAt:p.checkedAt,error:p.error,scope:p.scope});
 }
 return {list:[...byUrl.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))};
});
