const {request}=require('playwright-core');
const {XMLParser}=require('fast-xml-parser');
const {parseHTML}=require('linkedom');
const fs=require('fs'),path=require('path');
const out=path.resolve('docs/ocean-source-audit-2026-10-07');fs.mkdirSync(out,{recursive:true});
const prior=JSON.parse(fs.readFileSync('docs/ocean-energy-strategic-thinktank/requirements-content.json','utf8'));
const extra=[
['D01','EIA 海上原油月度表','https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=M&n=PET&s=MCRFP3FM2'],
['D02','SODIR 月度生产公告','https://www.sodir.no/en/whats-new/news/production-figures/'],
['D03','Transocean 2026Q2','https://investor.deepwater.com/news-releases/news-release-details/transocean-ltd-reports-second-quarter-2026-results'],
['D04','国家能源局 2026上半年发布会','https://www.nea.gov.cn/20260730/bb571bc20d7445e5ae7d9dc51c3f700d/c.html']
].map(([id,name,url])=>({id,name,url,group:'web'}));
const targets=prior.sources.filter(s=>s.id!=='S26').concat(extra);
const all=[],news=[];const txt=x=>String(x??'').replace(/\s+/g,' ').trim();
async function main(){
 const direct=await request.newContext({timeout:14000,userAgent:'Mozilla/5.0 (compatible; OceanSourceAudit/1.0)'});
 const proxy=await request.newContext({timeout:18000,proxy:{server:'http://127.0.0.1:10808'},userAgent:'Mozilla/5.0 (compatible; OceanSourceAudit/1.0)'});
 const test=await proxy.get('https://www.eia.gov/tools/rssfeeds/').then(r=>({status:r.status(),working:r.ok()})).catch(e=>({working:false,error:e.message.split('\n')[0]}));
 fs.writeFileSync(path.join(out,'proxy-check.json'),JSON.stringify(test,null,2));
 async function fetch(ctx,url,route){let t=Date.now();try{let r=await ctx.get(url);return {route,status:r.status(),final_url:r.url(),elapsed_ms:Date.now()-t,body:await r.text(),type:r.headers()['content-type']}}catch(e){return {route,error:e.message.split('\n')[0],elapsed_ms:Date.now()-t}}}
 for(let i=0;i<targets.length;i+=5){await Promise.all(targets.slice(i,i+5).map(async s=>{
  const row={id:s.id,name:s.name,url:s.url,method:s.group,checked_at:new Date().toISOString(),attempts:[]};
  let r=await fetch(direct,s.url,'direct');row.attempts.push({...r,body:undefined});
  // Proxy is only a network fallback; do not retry access-denied responses through another route.
  if(r.error&&test.working){r=await fetch(proxy,s.url,'local-proxy-10808');row.attempts.push({...r,body:undefined});}
  row.status=r.status||null;row.route=r.route;row.error=r.error;row.bytes=r.body?Buffer.byteLength(r.body):0;
  if(r.body&&r.status===200){
   if(/<(rss|feed)[\s>]/i.test(r.body)){
    const obj=new XMLParser({ignoreAttributes:false}).parse(r.body);let items=obj.rss?.channel?.item||obj.feed?.entry||[];if(!Array.isArray(items))items=[items];
    const itemsOut=items.map(x=>({source_id:s.id,source:s.name,title:txt(x.title),published:txt(x.pubDate||x.published||x.updated),url:typeof x.link==='string'?x.link:x.link?.['@_href'],collected_at:row.checked_at}));
    news.push(...itemsOut);row.feed_items=itemsOut.length;row.newest_item=itemsOut.filter(x=>Number.isFinite(Date.parse(x.published))).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published))[0];row.oldest_date=itemsOut.filter(x=>Number.isFinite(Date.parse(x.published))).sort((a,b)=>Date.parse(a.published)-Date.parse(b.published))[0]?.published;
   }else if(/^\s*\{/.test(r.body)){
    try{const j=JSON.parse(r.body);row.json_keys=Object.keys(j).slice(0,15);row.layers=j.layers?.map(l=>({id:l.id,name:l.name}));row.api_error=j.error;}catch{}
   }else{
    const {document}=parseHTML(r.body);row.title=txt(document.querySelector('title')?.textContent);row.links=[...document.querySelectorAll('a[href]')].map(a=>({text:txt(a.textContent),href:a.getAttribute('href')})).filter(a=>a.text.length>20&&a.text.length<220).slice(0,100);
    row.detected_feed_links=[...document.querySelectorAll('link[type]')].filter(e=>/rss|atom/.test(e.getAttribute('type'))).map(e=>e.getAttribute('href'));
    if(s.id.startsWith('D'))fs.writeFileSync(path.join(out,s.id+'-source.html'),r.body);
   }
  }
  all.push(row);console.log(JSON.stringify({id:row.id,status:row.status,route:row.route,feed:row.feed_items,error:row.error}));
 }));}
 fs.writeFileSync(path.join(out,'channel-probes.json'),JSON.stringify(all.sort((a,b)=>a.id.localeCompare(b.id)),null,2));
 fs.writeFileSync(path.join(out,'rss-news-samples.json'),JSON.stringify(news,null,2));
 await direct.dispose();await proxy.dispose();
 console.log(JSON.stringify({channels:all.length,news:news.length,proxy:test}));
}
main().catch(e=>{console.error(e);process.exit(1)});
