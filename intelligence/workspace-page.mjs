import {createHash} from 'node:crypto';
import {chartCaption} from './quant-preview/chart-caption.js';
import {availableViews} from './quant-preview/chart-views.js';
const {brandText}=process.env.APP_ID==='low-carbon'?await import('./system-profile.mjs'):{brandText:text=>text};
export const workspaceIdentity=data=>createHash('sha256').update(JSON.stringify([data?._readVersion,data?._workspaceDelta?.revision,data?.generatedAt,data?.insightRevision,data?.industryRuleVersion])).digest('hex');
export function quantPage(catalog,version,filterOptions){
 const cards=catalog.cards.map(card=>{const {rows,cohorts,...meta}=card;return {...meta,rows:[],rowCount:rows.length,caption:Object.fromEntries(Object.entries(chartCaption(card)).map(([k,v])=>[k,brandText(v)])),availableViews:availableViews(card),deferred:true,...(cohorts?{cohorts:cohorts.map(({rows,...c})=>({...c,rows:[],rowCount:rows.length}))}:{})};});
 return {snapshotAt:catalog.snapshotAt,insightRevision:catalog.insightRevision,audit:catalog.audit,industries:catalog.industries,sources:catalog.sources,cards,planner:{templates:catalog.planner.templates.map(({id,name,types,requires,update,matches})=>({id,name,types,requires,update,matches}))},filterOptions,workspaceView:{version,snapshotAt:catalog.snapshotAt}};
}
export function normalizeWorkspaceQuery(type,input={}){
 const scope=['topic','country','sourceId','from','to'],allowed=type==='inventory'?[...scope,'kind','q','status','sort','order','state','origin','page','pageSize','deleted']:type==='card'?[...scope,'id','version']:scope;
 for(const key of Object.keys(input))if(!allowed.includes(key))throw Object.assign(Error('不支持的资料筛选条件'),{status:400});
 const rows=Object.entries(input).filter(([k,v])=>v!==''&&v!==undefined&&!(k==='page'&&String(v)==='1')&&!(k==='pageSize'&&String(v)==='25')&&!(k==='kind'&&v==='documents'));
 return Object.fromEntries(rows.sort(([a],[b])=>a.localeCompare(b)));
}
