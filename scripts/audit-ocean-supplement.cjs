const {request}=require('playwright-core'),{parseHTML}=require('linkedom'),fs=require('fs'),path=require('path');
const out=path.resolve('docs/ocean-source-audit-2026-10-07');
const targets=[
['G01','SODIR field feature query','https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer/7100/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=3&f=json',true],
['G02','EMODnet windfarms WFS','https://ows.emodnet-humanactivities.eu/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=emodnet:windfarms&count=2&outputFormat=application%2Fjson',false],
['N01','Northern Lights corrected newsroom','https://norlights.com/newsroom/',false],
['C24','NEA 2024','https://www.nea.gov.cn/20250221/e10f363cabe3458aaf78ba4558970054/c.html',false],
['C25','NEA 2025','https://www.nea.gov.cn/20260212/742b8c6a078347b0b39de676c05c5d58/c.html',false],
['C25H','NEA 2025H1','https://obor.nea.gov.cn/detail2/22150.html',false],
['NO08','SODIR August production','https://www.sodir.no/en/whats-new/news/production-figures/2026/production-figures-august-2026/',false]
];
const news=JSON.parse(fs.readFileSync(path.join(out,'rss-news-samples.json'),'utf8'));
for(const [id,re] of [['R01',/Yinson Production/],['R02',/Subsea battery system/],['R03',/Vestas Partners/]]){const n=news.find(x=>re.test(x.title));if(n)targets.push([id,n.title,n.url,false]);}
(async()=>{const d=await request.newContext({timeout:14000}),p=await request.newContext({timeout:18000,proxy:{server:'http://127.0.0.1:10808'}});const results=[];
for(let i=0;i<targets.length;i+=4)await Promise.all(targets.slice(i,i+4).map(async([id,name,url,useProxy])=>{
const row={id,name,url,checked_at:new Date().toISOString(),route:useProxy?'proxy':'direct'};let r;
try{try{r=await(useProxy?p:d).get(url)}catch(e){if(useProxy)throw e;row.direct_error=e.message.split('\n')[0];r=await p.get(url);row.route='proxy';}row.status=r.status();let body=await r.text();if(r.ok()){
 if(id.startsWith('G')){try{let j=JSON.parse(body);row.features=j.features?.length;row.error=j.error;row.first_attributes=j.features?.[0]?.attributes||j.features?.[0]?.properties;row.spatialReference=j.spatialReference;fs.writeFileSync(path.join(out,id+'-features.json'),JSON.stringify(j,null,2));}catch{row.body_start=body.slice(0,180)}}else{
 const doc=parseHTML(body).document;row.title=doc.querySelector('title')?.textContent;row.headline=doc.querySelector('h1')?.textContent?.trim();row.published=doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content');
 if(id.startsWith('C')||id==='NO08')fs.writeFileSync(path.join(out,id+'-source.html'),body);
 row.snippets=doc.body.textContent.replace(/\s+/g,' ').match(/.{0,30}海上风电.{0,90}/g)?.slice(0,5);
 row.links=id==='N01'?[...doc.querySelectorAll('a[href]')].map(a=>({text:a.textContent.trim().replace(/\s+/g,' '),url:a.getAttribute('href')})).filter(a=>a.text.length>20).slice(0,25):undefined;
 }
}}catch(e){row.error=e.message.split('\n')[0];}results.push(row);console.log(JSON.stringify(row));
}));fs.writeFileSync(path.join(out,'supplement-probes.json'),JSON.stringify(results,null,2));await d.dispose();await p.dispose();})();
