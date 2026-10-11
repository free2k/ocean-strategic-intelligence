import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {parseHTML} from 'linkedom';
import {canonicalUrl,getResource} from './x-evidence.mjs';
import {initEvidence,queueLink} from './x-evidence-store.mjs';
import {pool} from './mp2rss-store.mjs';

export const feeds=[{id:'oilprice-main',name:'OilPrice 行业分析',url:'https://oilprice.com/rss/main'},{id:'oilprice-news',name:'OilPrice 新闻快讯',url:'https://oilprice.com/rss/energy'}];
export function feedDate(value){
 const raw=String(value||'').trim(),zone='America/Chicago';
 if(!raw)return null;
 if(raw.endsWith(zone)){
  const wall=Date.parse(raw.replace(zone,'GMT'));if(!Number.isFinite(wall))return null;
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'});
  let instant=wall;
  for(let i=0;i<3;i++){const z=fmt.formatToParts(new Date(instant)).find(p=>p.type==='timeZoneName').value.match(/GMT([+-])(\d\d):(\d\d)/);if(!z)return null;instant=wall-(z[1]==='-'?-1:1)*(Number(z[2])*60+Number(z[3]))*60000;}
  return new Date(instant).toISOString();
 }
 const n=Date.parse(raw);return Number.isFinite(n)?new Date(n).toISOString():null;
}
export function parseFeed(xml){
 if(XMLValidator.validate(xml)!==true)throw Error('invalid_feed');
 const channel=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml)?.rss?.channel;
 if(!channel)throw Error('not_rss');
 return (Array.isArray(channel.item)?channel.item:channel.item?[channel.item]:[]).flatMap(item=>{
  try{const url=canonicalUrl(item.link);if(new URL(url).hostname!=='oilprice.com'||!new URL(url).pathname.endsWith('.html'))return [];
   const text=x=>parseHTML('<div>'+String(x||'')+'</div>').document.documentElement.textContent.trim();
   return [{url,title:text(item.title),summary:text(item.description),author:text(item['dc:creator']||item.author),publishedAt:feedDate(item.pubDate),publishedRaw:String(item.pubDate||''),guid:String(item.guid?.['#text']||item.guid||url)}];
  }catch{return [];}
 });
}
export async function discoverOilprice(){
 await initEvidence();const result={feeds:[],discovered:0};
 for(const feed of feeds){
  // Removing a source in the existing RSS screen stops its future discovery.
  const registered=(await pool.query('SELECT id FROM public.sources WHERE fakeid=$1 AND alias=$2',[feed.id,feed.url])).rows[0];if(!registered)continue;
  try{const resource=await getResource(feed.url);if(!resource.buffer)throw Error('feed_unavailable');const items=parseFeed(resource.buffer.toString('utf8'));
   for(const item of items){await queueLink(item.url,'link',{provider:'OilPrice RSS',subscriptionId:feed.id,subscriptionName:feed.name,feedUrl:feed.url,articleUrl:item.url,author:item.author,feedPublishedAt:item.publishedAt,feedPublishedRaw:item.publishedRaw,relation:'rss'});
    await pool.query("INSERT INTO mp2rss.state(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",['oilprice-item:'+item.url,{...item,feedUrl:feed.url,contentStatus:'summary_only'}]);
   }
   result.discovered+=items.length;result.feeds.push({name:feed.name,url:feed.url,status:'success',count:items.length,latest:items.map(i=>i.publishedAt).filter(Boolean).sort().at(-1)||null});
  }catch{result.feeds.push({name:feed.name,url:feed.url,status:'failed',error:'Feed 获取或解析失败，下轮重试'});}
 }
 await pool.query("INSERT INTO mp2rss.state(id,payload) VALUES('oilprice-sync',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[{...result,checkedAt:new Date().toISOString(),intervalMinutes:30}]);return result;
}
