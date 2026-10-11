import fs from 'node:fs/promises';import {fetch} from 'undici';import {parseHTML} from 'linkedom';
const entries=[
 ['equinor','https://www.equinor.com/news'],
 ['exxon','https://investor.exxonmobil.com/company-information/press-releases/rss'],
 ['total','https://totalenergies.com/news/press-releases'],
 ['boem','https://www.boem.gov/renewable-energy/lease-and-grant-information'],
 ['sodir','https://factmaps.sodir.no/api/rest/services/DataService/Data/FeatureServer/7100/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=3&f=json'],
 ['nsta','https://www.nstauthority.co.uk/news-publications/news/'],
 ['oes','https://www.ocean-energy-systems.org/news/'],
 ['gem','https://globalenergymonitor.org/projects/global-wind-power-tracker/download-data/'],
 ['irena','https://www.irena.org/Publications'],
 ['gwec','https://www.gwec.net/reports/global-offshore-wind-report-2025'],
 ['cnooc-group','https://www.cnooc.com.cn/zxzx/gsxw/gsxw/'],
 ['imo','https://www.imo.org/en/MediaCentre/PressBriefings/Pages/Default.aspx']
];
const out=[];for(let start=0;start<entries.length;start+=3){await Promise.all(entries.slice(start,start+3).map(async([id,url])=>{const row={id,url,checkedAt:new Date().toISOString()};try{const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'OceanEnergyResearch/1.0'}});const body=await r.text();Object.assign(row,{status:r.status,finalUrl:r.url,bytes:body.length,type:r.headers.get('content-type')});if(r.ok){await fs.mkdir('.data/source-expansion',{recursive:true});await fs.writeFile('.data/source-expansion/'+id+'.raw',body);const {document}=parseHTML(body);row.title=document.querySelector('title')?.textContent;row.links=[...document.querySelectorAll('a[href]')].map(a=>({title:a.textContent.trim().slice(0,150),url:a.getAttribute('href')})).filter(x=>x.title.length>12&&/news|2026|press|lease|field/i.test(x.url)).slice(0,12);if(id==='sodir'){const j=JSON.parse(body);row.sample=j.features?.[0];row.apiError=j.error;}}}catch{row.error='network_or_parse_failed';}out.push(row);console.log(JSON.stringify(row));}));}await fs.writeFile('.data/source-expansion/probes.json',JSON.stringify(out,null,2));
