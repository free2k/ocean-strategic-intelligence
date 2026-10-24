import {sharedRequest} from './shared-client.mjs';
import {subscriptionWithLocalCounts} from './shared-policy.mjs';
import {currentRules,previewClassification,enqueueClassification,applyClassificationJob} from '../classification-jobs.mjs';
import {standardTopics,taxonomyVersion,topicDefinition} from '../industry-topics.mjs';
import {invalidateAudit} from '../classification-audit.mjs';
const fields=r=>({...r,titleKeywords:r.title_keywords,contentKeywords:r.content_keywords,requireAll:r.require_all,domain:topicDefinition(r.topic)});
export async function serveLowCarbon(req,res,url,{store,scheduler,auditData,body,json}){
 const route=url.pathname,pool=store.pool;
 if(route==='/api/system'){json(res,200,{appId:'low-carbon',instanceId:process.env.LC_INSTANCE_ID,taxonomyVersion,database:'low_carbon_kb',isolation:{articles:true,rules:true,vectors:true,research:true,tasks:true,sessions:true},shared:['AI model service','subscription registry'],collection:scheduler.status()});return true;}
 if(route==='/api/shared-services'){const s=await sharedRequest('/status');json(res,200,s);return true;}
 if(route==='/api/filters'&&req.method==='GET'){json(res,200,{rules:(await currentRules(pool)).rules.map(fields),definitions:standardTopics,taxonomyVersion,supplementalRules:[],contextName:'通用低碳语境',marineContextPattern:'数据库通用低碳语境：标题或正文前1800字符；只检查范围，不直接决定领域'});return true;}
 const rule=route.match(/^\/api\/filters\/(\d+)$/);
 if(rule&&req.method==='PUT'){
  const b=await body(req,100000),existing=(await pool.query('SELECT * FROM public.filter_rules WHERE id=$1',[rule[1]])).rows[0];if(!existing){json(res,404,{error:'规则不存在'});return true;}
  if(b.ruleIdentity!==existing.type+':'+(existing.topic||'')){json(res,409,{error:'规则结构已更新，请刷新页面后再编辑。'});return true;}
  const words=(v,fallback)=>{if(v===undefined)return fallback;if(!Array.isArray(v)||v.length>500||v.some(k=>typeof k!=='string'||k.length>100))throw Object.assign(Error('关键词须为文本列表，最多500项，每项100字以内'),{status:400});return [...new Set(v.map(x=>x.trim()).filter(Boolean))];};
  if(b.groups!==undefined&&(!Array.isArray(b.groups)||b.groups.length>20))throw Object.assign(Error('组合条件格式错误'),{status:400});
  const groups=b.groups===undefined?existing.groups:b.groups.map(g=>words(g,[]));
  const saved=(await pool.query('UPDATE public.filter_rules SET description=$2,title_keywords=$3,content_keywords=$4,groups=$5,enabled=$6,updated_at=now() WHERE id=$1 RETURNING *',[rule[1],String(b.description??existing.description).slice(0,3000),JSON.stringify(words(b.titleKeywords,existing.title_keywords)),JSON.stringify(words(b.contentKeywords,existing.content_keywords)),JSON.stringify(groups),b.enabled===undefined?existing.enabled:!!b.enabled])).rows[0];json(res,200,{success:true,rule:fields(saved)});return true;
 }
 if(route==='/api/filters/reprocess'){
  if(req.method==='GET'){json(res,200,url.searchParams.get('preview')==='1'?{preview:await previewClassification(pool,{...Object.fromEntries(url.searchParams),pendingOnly:url.searchParams.get('pendingOnly')==='true'})}:{jobs:(await pool.query('SELECT id,version,scope,status,preview,result,error,created_at,started_at,finished_at FROM classification.jobs ORDER BY id DESC LIMIT 10')).rows});return true;}
  if(req.method==='POST'){if(scheduler.status().running){json(res,409,{error:'低碳采集任务正在运行'});return true;}const job=await enqueueClassification(pool,await body(req));void scheduler.run({processOnly:true});json(res,202,job);return true;}
 }
 if(route==='/api/rss/sync'&&req.method==='POST'){const b=await body(req);void scheduler.run({sourceId:b.sourceId});json(res,202,{accepted:true,scope:'low-carbon',message:'已提交低碳版独立采集'});return true;}
 if(route==='/api/subscriptions/action'&&req.method==='POST'){
  const b=await body(req);if(b.action==='sync'){void scheduler.run({subscriptionId:b.id});json(res,202,{accepted:true,scope:'low-carbon'});return true;}
  if(!['refresh','subscribe','unsubscribe','update'].includes(b.action)){json(res,400,{error:'不支持的订阅操作'});return true;}
  json(res,200,await sharedRequest(route,{method:'POST',body:b}));return true;
 }
 if(route==='/api/subscriptions'&&req.method==='GET'){
  const [shared,audit,jobs]=await Promise.all([sharedRequest(route),auditData(),pool.query('SELECT * FROM mp2rss.jobs ORDER BY id DESC LIMIT 12')]);
  const counts=new Map(audit.subscriptions.map(s=>[s.id,s]));
  const list=(shared.list||[]).map(s=>subscriptionWithLocalCounts(s,counts.get(s.id)));
  json(res,200,{list,jobs:jobs.rows,observedAt:audit.observedAt,classification:audit.mpCounts,bridge:{eligible:audit.documents.filter(d=>d.channelGroup==='mp2rss'&&d.classification?.status==='accepted').length,delivered:audit.documents.filter(d=>d.channelGroup==='mp2rss'&&d.synced).length},configured:shared.configured,sharedRegistry:true,state:scheduler.status()});return true;
 }
 if(route==='/api/rss/sources'&&req.method==='GET'){
  const shared=await sharedRequest(route),locals=store.data.sources;
  const list=(shared.list||[]).map(s=>{const local=locals.find(l=>l.url===(s.alias||s.url));return {...s,count:local?store.data.documents.filter(d=>d.sourceId===local.id).length:0,localCount:undefined,checkedAt:local?.checkedAt||null,status:local?.status||'unverified'};});
  for(const s of locals)if(!list.some(l=>(l.alias||l.url)===s.url))list.push({...s,id:'intel:'+s.id,alias:s.url,count:store.data.documents.filter(d=>d.sourceId===s.id).length,manager:'low-carbon'});
  json(res,200,{list,sharedRegistry:true});return true;
 }
 if((route==='/api/rss/sources'&&req.method==='POST')||(/^\/api\/rss\/sources\/\d+$/.test(route)&&['PATCH','DELETE'].includes(req.method))){json(res,200,await sharedRequest(route,{method:req.method,...(req.method==='DELETE'?{}:{body:await body(req)})}));return true;}
 return false;
}
