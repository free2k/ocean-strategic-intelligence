import {translationResource,visionResource,publicResource} from './model-resources.mjs';

export async function serveModelResource(req,res,url,{documents,store,body,json,limited=()=>false,enabled=true}){
 const match=url.pathname.match(/^\/api\/document\/([^/]+)\/(translation|vision)$/);
 const status=url.pathname.match(/^\/api\/model-resources\/([a-f0-9]{64})$/);
 if(!match&&!status)return false;
 if(!store){json(res,503,{error:'按需生成暂未配置，请联系管理员启用后台处理服务。'});return true;}
 if(status&&req.method==='GET'){
  const row=await store.resourceStatus(status[1]);json(res,row?200:404,row?publicResource(row):{error:'未找到生成任务'});return true;
 }
 if(!match||req.method!=='POST'){json(res,405,{error:'不支持的生成操作'});return true;}
 if(!enabled){json(res,503,{error:'按需生成后台尚未启用，原文和已有译文继续可用。'});return true;}
 const doc=documents.find(d=>d.id===decodeURIComponent(match[1]));
 if(!doc){json(res,404,{error:'资料不存在'});return true;}
 if(limited(req,'on-demand-model',20,3600000)){json(res,429,{error:'本小时生成次数已用完，请稍后再试。'});return true;}
 let request;
 if(match[2]==='translation'){
  if(!doc.content?.trim()){json(res,400,{error:'原文正文尚未取得，请先补充原文。'});return true;}
  if(doc.contentZh||doc.language==='zh'){json(res,200,{status:'completed',result:{contentZh:doc.contentZh||doc.content}});return true;}
  request=translationResource(doc);
 }else{
  const input=await body(req);const asset=(doc.evidenceAssets||[]).find(a=>a.url===input.url);
  if(!asset?.sha256||!asset.snapshot){json(res,400,{error:'该图片的原始文件尚未取得，暂不能识别。'});return true;}
  request=visionResource(asset);
 }
 const job=await store.queueResource(request);json(res,job.status==='completed'?200:202,publicResource(job));return true;
}
