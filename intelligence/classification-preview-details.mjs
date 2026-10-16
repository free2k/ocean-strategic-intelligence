import {articleBatches,currentRules,decideArticle,textBody} from './classification-jobs.mjs';
import {compileRules} from './industry-classification.mjs';
const snapshots=new Map();
export function changeDetail(a,decision){
 const before=a.filter_status==='accepted'?'accepted':a.filter_status==='rejected'?'excluded':'unmatched';
 if(before===decision.status&&a.matched_topic===decision.primary)return null;
 const content=textBody(a.mp_content??a.content),title=a.title||'';
 const hits=[...(decision.positive||[]).flatMap(p=>(p.keywords||[]).map(k=>({...k,topic:p.topic,kind:'正向'}))),...(decision.negative||[]).map(k=>({...k,kind:'反向'}))];
 return {id:a.id,title,url:a.link,before,beforeTopic:a.matched_topic,after:decision.status,topic:decision.primary,reason:decision.reason,primaryBasis:decision.primaryBasis,source:a.source_name,publishedAt:a.published_at,evidence:hits.map(k=>{const body=k.field==='标题'?title:k.field==='正文'?content:title+'\n'+content,index=body.toLocaleLowerCase().indexOf(String(k.keyword).toLocaleLowerCase());return {...k,quote:index<0?'':body.slice(Math.max(0,index-90),index+String(k.keyword).length+150)};})};
}
export async function previewDetails(pool,{token,page=1}){
 if(!pool)throw Error('当前环境未连接分类数据库');
 if(!/^[a-f0-9]{64}$/.test(token||'')||!Number.isSafeInteger(page)||page<1)throw Error('预览参数无效');
 const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const preview=(await db.query("SELECT payload,created_at FROM classification.previews WHERE token=$1 AND created_at>now()-interval '1 hour'",[token])).rows[0];if(!preview)throw Error('预览已过期，请重新预览影响范围');
 const compiled=compileRules(await currentRules(db));if(compiled.version!==preview.payload.version)throw Error('规则已变化，请重新预览影响范围');
 const key=token+'|'+String(preview.created_at);let saved=snapshots.get(key);
 if(!saved||Date.now()-saved.at>3600000){const items=[];for await(const rows of articleBatches(db,preview.payload.scope))for(const row of rows){const detail=changeDetail(row,decideArticle(row,compiled).decision);if(detail)items.push(detail);}saved={items,at:Date.now()};snapshots.set(key,saved);while(snapshots.size>5)snapshots.delete(snapshots.keys().next().value);}
 await db.query('COMMIT');const total=saved.items.length,current=Math.min(page,Math.max(total,1));return {page:current,total,item:saved.items[current-1]||null,expectedTotal:preview.payload.changed,observedAt:new Date(saved.at).toISOString()};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
