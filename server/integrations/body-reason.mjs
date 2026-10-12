import {plain} from './mp2rss-client.mjs';

export function bodyReason(payload){
 if(!payload||payload.contentStatus==='complete')return null;
 const raw=payload.raw||{},field=payload.kind==='x_post'?'content':'contentMarkdown';
 const markdown=String(raw[field]||''),text=plain(markdown);
 if(payload.cleaning?.removed?.length&&String(payload.originalContent||'').trim()&&!String(payload.content||'').trim())return {code:'cleaned_empty',label:'清洗后无有效正文',detail:'已获取文字，但移除互动提示等非正文内容后没有剩余文字。请核对原文及清洗结果。'};
 const images=(markdown.match(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi)||[]).length;
 if(images&&!text)return {code:'image_only',label:'图片正文待识别',detail:`来源返回 ${images} 张图片，未提供可提取的文字；当前尚未进行 OCR。可打开原文，将识别并核对后的文字手动补充。`};
 if(!text&&(/<(?:video|audio|iframe)\b/i.test(markdown)||payload.kind==='x_post'&&payload.context?.media?.length))return {code:'media_only',label:'仅媒体，缺少文字',detail:'来源返回媒体内容，但没有可提取的文字。需查看原始媒体后补充经核对的文字。'};
 if(Object.hasOwn(raw,field)&&!markdown.trim())return {code:'provider_empty',label:'来源未返回正文',detail:'最近一次保存的 Mp2RSS 返回结果中，正文字段为空。现有信息无法判断是视频文章、访问限制还是上游解析失败；可同步重试或打开原文手动补充。'};
 if(text)return {code:'text_unprocessed',label:'文字解析待核对',detail:'来源返回了文字，但当前记录尚无有效正文。请重新同步并核对解析结果。'};
 return {code:'unknown',label:'缺正文原因待核对',detail:'当前记录没有足够的原始内容判断原因，可重新同步或打开原文核对。'};
}

export async function attachBodyReasons(pool,list){
 const rows=(await pool.query("SELECT subscription_id,payload FROM mp2rss.items WHERE payload->>'contentStatus' IS DISTINCT FROM 'complete'")).rows;
 const byId=new Map(list.map(s=>{s.body_reasons=[];return [s.id,s];}));
 for(const row of rows){const source=byId.get(row.subscription_id);if(!source)continue;const reason=bodyReason(row.payload);if(!reason)continue;const existing=source.body_reasons.find(r=>r.code===reason.code);if(existing)existing.count++;else source.body_reasons.push({code:reason.code,label:reason.label,count:1});}
 return list;
}
