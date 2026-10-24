// Explicit operator-run acceptance. Original database access is read-only.
import {verifyLowCarbonEnvironment} from './runtime.mjs';
import fs from 'node:fs/promises';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
await verifyLowCarbonEnvironment();
for(let attempt=0;;attempt++){try{const r=await fetch('http://127.0.0.1:3201/api/health');if(r.ok)break;}catch{}if(attempt===29)throw Error('LOW_CARBON_APP_NOT_READY');await new Promise(resolve=>setTimeout(resolve,500));}
const config={};for(const line of (await fs.readFile('/opt/knowledge-base/.env','utf8')).split(/\r?\n/)){const m=line.match(/^(DATABASE_URL|SITE_PASSWORD)=(.*)$/);if(m)config[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
const own=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}),original=new pg.Pool({connectionString:config.DATABASE_URL,max:1,options:'-c default_transaction_read_only=on'});
const hash=b=>createHash('sha256').update(b).digest('hex'),rules=async p=>(await p.query('SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text) digest FROM public.filter_rules r')).rows[0].digest;
const baselineFile=process.env.LC_ACCEPTANCE_BASELINE||'/opt/low-carbon/acceptance/original-before.json',reportFile=process.env.LC_ACCEPTANCE_REPORT||'/opt/low-carbon/acceptance/isolation-results.json';
if(![baselineFile,reportFile].every(p=>p.startsWith('/opt/low-carbon/acceptance/')&&!p.includes('..')))throw Error('ACCEPTANCE_PATH_REJECTED');
const originalBefore=JSON.parse(await fs.readFile(baselineFile,'utf8'));
const checks=[],check=(name,passed,details={})=>{checks.push({name,passed,...details});if(!passed)throw Error('Acceptance failed: '+name);};
let rule,source,article;
try{
 const ownIdentity=(await own.query('SELECT current_database() name,inet_server_port() port,current_user role')).rows[0];
 check('independent_database',ownIdentity.name==='low_carbon_kb'&&ownIdentity.port===55432&&ownIdentity.role==='lc_app',{identity:ownIdentity});
 const identity=(await original.query('SELECT current_database() name,inet_server_port() port')).rows[0];check('original_database_unchanged',JSON.stringify(identity)===JSON.stringify(originalBefore.identity),{identity});
 const fingerprint=await rules(original);check('original_rules_match_baseline',fingerprint===originalBefore.rules.digest);
 rule=(await own.query('SELECT id,description FROM public.filter_rules ORDER BY id LIMIT 1')).rows[0];
 await own.query('UPDATE public.filter_rules SET description=$2 WHERE id=$1',[rule.id,'LC_ISOLATION_'+randomUUID()]);check('low_carbon_rule_change_does_not_change_original',await rules(original)===fingerprint);
 await own.query('UPDATE public.filter_rules SET description=$2 WHERE id=$1',[rule.id,rule.description]);rule=null;
 const nonce=randomUUID(),url='https://isolation.invalid/'+nonce;
 source=(await own.query("INSERT INTO public.sources(fakeid,name,type) VALUES($1,'低碳隔离事务探针','acceptance') RETURNING id",['lc-probe-'+nonce])).rows[0].id;
 article=(await own.query("INSERT INTO public.articles(title,link,content,source_id,source_type) VALUES('低碳隔离事务探针',$1,'仅用于独立数据库写入验收，验证后删除。',$2,'acceptance') RETURNING id",[url,source])).rows[0].id;
 await own.query('INSERT INTO public.article_chunks(article_id,chunk_index,content,embedding) VALUES($1,0,$2,$3::vector)',[article,'独立向量写入探针',JSON.stringify(Array(1024).fill(0))]);
 check('committed_article_and_vector_absent_from_original',(await original.query('SELECT count(*)::int n FROM public.articles WHERE link=$1',[url])).rows[0].n===0);
 await own.query('DELETE FROM public.article_chunks WHERE article_id=$1',[article]);await own.query('DELETE FROM public.articles WHERE id=$1',[article]);article=null;await own.query('DELETE FROM public.sources WHERE id=$1',[source]);source=null;
 const login=await fetch('http://127.0.0.1:3201/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});check('low_carbon_login',login.status===200);
 const cookie=login.headers.get('set-cookie').split(';')[0],exp=String(Date.now()+60000),oldCookie='site_auth='+exp+'.'+createHmac('sha256',config.SITE_PASSWORD).update(exp).digest('hex');
 const call=(port,path,c)=>fetch(`http://127.0.0.1:${port}${path}`,{headers:{Cookie:c}});
 check('original_cookie_positive_control',(await (await call(3101,'/api/session',oldCookie)).json()).authenticated===true);
 check('low_carbon_cookie_positive_control',(await call(3201,'/api/system',cookie)).status===200);
 check('original_cookie_rejected_by_low_carbon',(await call(3201,'/api/data',oldCookie)).status===401);
 check('low_carbon_cookie_rejected_by_original',!(await (await call(3101,'/api/session',cookie)).json()).authenticated);
 const logout=await fetch('http://127.0.0.1:3201/api/logout',{method:'POST',headers:{Cookie:cookie}}),cleared=logout.headers.getSetCookie();check('logout_clears_only_low_carbon_cookie',cleared.length===1&&cleared[0].startsWith('lc_site_auth='));
 for(const route of ['/api/articles','/api/filters','/api/data','/api/rss/sync']){const r=await fetch('http://127.0.0.1:3270'+route,{headers:{Authorization:'Bearer '+process.env.LC_GATEWAY_TOKEN}});check('gateway_blocks_'+route,r.status===403);}
 for(const [file,before] of Object.entries(originalBefore.files))check('original_file_unchanged_'+file,hash(await fs.readFile(file))===before);
 for(const [service,before] of Object.entries(originalBefore.services)){const after=execFileSync('systemctl',['show',service,'-p','MainPID','-p','ActiveEnterTimestamp'],{encoding:'utf8'});check('original_service_not_restarted_'+service,after===before);}
 for(const [port,path] of [[3000,'/'],[3101,'/api/health']]){const r=await fetch(`http://127.0.0.1:${port}${path}`);check('original_health_'+port,r.status===200);await r.body.cancel();}
 const appPid=execFileSync('systemctl',['show','low-carbon-app','-p','MainPID','--value'],{encoding:'utf8'}).trim();
 for(const file of ['/opt/knowledge-base/.env','/opt/ocean-intelligence/data']){const r=execFileSync('nsenter',['-t',appPid,'-m','--','runuser','-u','lowcarbon','--','sh','-c','if test -r "$1"; then printf readable; else printf denied; fi','sh',file],{encoding:'utf8'});check('low_carbon_user_cannot_read_'+file,r==='denied');}
 const counts=(await own.query("SELECT (SELECT count(*) FROM public.articles)::int articles,(SELECT count(*) FROM ocean_intel.documents)::int documents,(SELECT count(*) FROM public.article_chunks)::int vectors,(SELECT count(*) FROM public.filter_rules)::int rules,(SELECT count(*) FROM ocean_research.records)::int researchRecords")).rows[0];
 const domains=(await own.query("SELECT classification->>'primary' topic,count(*)::int count FROM classification.articles WHERE classification->>'status'='accepted' GROUP BY 1 ORDER BY 1")).rows;
 const report={at:new Date().toISOString(),checks,counts,domains,limits:['same host and Nginx','shared AI quota and provider subscription registry','no original production outage or cancellation tests']};
 await fs.writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{
 if(rule)await own.query('UPDATE public.filter_rules SET description=$2 WHERE id=$1',[rule.id,rule.description]);
 if(article){await own.query('DELETE FROM public.article_chunks WHERE article_id=$1',[article]);await own.query('DELETE FROM public.articles WHERE id=$1',[article]);}
 if(source)await own.query('DELETE FROM public.sources WHERE id=$1',[source]);
 await own.end();await original.end();
}
