// Read-only one-shot source research. No credentials, bypasses or subscriptions.
const {request}=require('playwright-core');
const {XMLParser,XMLValidator}=require('fast-xml-parser');
const fs=require('fs'),path=require('path');
const targets=[
['oilprice','https://oilprice.com/rss/main'],
['offshore-energy','https://www.offshore-energy.biz/feed/'],
['offshorewind','https://www.offshorewind.biz/feed/'],
['eia-today','https://www.eia.gov/rss/todayinenergy.xml'],
['oe-home','https://www.oedigital.com/'],
['shell-news','https://www.shell.com/news-and-insights/newsroom.html'],
['exxon-news','https://corporate.exxonmobil.com/news'],
['petrobras-news','https://agencia.petrobras.com.br/en/'],
['sodir-api','https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer?f=pjson'],
['nea','https://www.nea.gov.cn/'],
['mnr','https://www.mnr.gov.cn/'],
['stats','https://www.stats.gov.cn/'],
];
(async()=>{const ctx=await request.newContext({timeout:18000,userAgent:'OceanKnowledgeSourceResearch/1.0 (read-only availability check)'}),result=[];for(let i=0;i<targets.length;i+=4){await Promise.all(targets.slice(i,i+4).map(async([id,url])=>{const row={id,url,checked_at:new Date().toISOString(),probe_environment:'local Windows Playwright HTTP client',status:null};try{const r=await ctx.get(url);row.status=r.status();row.final_url=r.url();row.content_type=r.headers()['content-type'];const body=await r.text();row.bytes=Buffer.byteLength(body);if(/<(rss|feed)[\s>]/i.test(body)&&XMLValidator.validate(body)===true){const obj=new XMLParser({ignoreAttributes:false}).parse(body);let items=obj.rss?.channel?.item||obj.feed?.entry||[];items=Array.isArray(items)?items:[items];row.feed_items=items.length;row.feed_fields=items[0]?Object.keys(items[0]):[];row.is_valid_feed=true}else{row.is_valid_feed=false;row.discovered_feed_links=[...body.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).filter(s=>/application\/(rss|atom)\+xml/i.test(s)).map(s=>(s.match(/href=["']([^"']+)/i)||[])[1]).filter(Boolean);if(id==='sodir-api'){try{const j=JSON.parse(body);row.api_layers=j.layers?.length;row.api_error=j.error?.message}catch{}}}}catch(e){row.error=e.message.split('\n')[0]}result.push(row);console.log(JSON.stringify(row))}))}await ctx.dispose();const out=path.resolve('docs/ocean-energy-strategic-thinktank');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'source-probes-2026-10-07.json'),JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exit(1)});
