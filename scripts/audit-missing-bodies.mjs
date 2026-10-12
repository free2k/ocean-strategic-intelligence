import {pool} from '../server/integrations/mp2rss-store.mjs';
import {client,plain} from '../server/integrations/mp2rss-client.mjs';
try{
 const rows=(await pool.query(`SELECT s.payload AS source,s.last_sync,s.error,i.payload FROM mp2rss.items i JOIN mp2rss.subscriptions s ON s.id=i.subscription_id WHERE s.present AND s.payload->>'platform'='mp' AND i.payload->>'contentStatus' IS DISTINCT FROM 'complete' ORDER BY s.payload->>'name'`)).rows;
 const api=client(),remote=new Map();
 for(const row of rows){const id=row.source.remoteId;if(remote.has(id))continue;try{const result=await api('/open-api/subscriptions/'+id+'/articles?page=1&pageSize=100');remote.set(id,result.items||[]);}catch{remote.set(id,null);}}
 for(const r of rows){const p=r.payload,raw=p.raw||{},fresh=remote.get(r.source.remoteId)?.find(x=>String(x.articleId)===String(raw.articleId));
 const describe=x=>x?{keys:Object.keys(x),markdownLength:String(x.contentMarkdown||'').length,plainLength:plain(x.contentMarkdown).length,summaryLength:String(x.summary||'').length,status:x.status??x.contentStatus??null,images:(String(x.contentMarkdown||'').match(/!\[/g)||[]).length,preview:String(x.contentMarkdown||'').slice(0,180)}:null;
 console.log(JSON.stringify({source:r.source.name,title:p.title,url:p.url,lastSync:r.last_sync,syncError:r.error,cleanedLength:p.content?.length||0,originalLength:p.originalContent?.length||0,removed:p.cleaning?.removed?.map(x=>x.reason),stored:describe(raw),fresh:describe(fresh)}));}
 console.log(JSON.stringify({missing:rows.length,accounts:remote.size}));
}finally{await pool.end();}
