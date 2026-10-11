import {createHash} from 'node:crypto';
export const cleaningVersion='mp-body-v1';
const plain=s=>s.replace(/[*_#`~]/g,'').replace(/^[\s>*•-]+/,'').trim();
export function cleanMPContent(text){
 const original=String(text||''),lines=original.replace(/\r/g,'').split('\n'),removed=[];let offset=0,cut=lines.length;
 for(let i=0;i<lines.length;i++){
  const line=plain(lines[i]);
  const heading=/^(?:推荐阅读|相关阅读|往期推荐|往期回顾|延伸阅读|精彩回顾|更多精彩|猜你喜欢)[：:！!\s]*$/.test(line);
  const arrows=lines.slice(i).filter(l=>/^►/.test(plain(l)));
  const recommendationList=/^►/.test(line)&&arrows.length>=3&&arrows.filter(l=>/出版|图书|书目|丛书|推荐|招展/.test(l)).length>=3;
  if(offset>=200&&(heading||recommendationList)){cut=i;removed.push({reason:heading?'推荐阅读区':'文末图书／活动推荐列表',text:lines.slice(i).join('\n')});break;}offset+=lines[i].length+1;
 }
 const body=lines.slice(0,cut).filter(l=>{
  const line=plain(l);const cta=line.length<260&&/如您喜欢|喜欢.{0,8}(本文|文章)|点亮.{0,20}在看|点击.{0,12}(关注|在看)|点赞.{0,20}(在看|转发)|扫码.{0,12}关注/.test(line)&&/点赞|在看|关注|转发/.test(line);
  const brand=/^海洋知圈[：:]知晓海洋/.test(line.replace(/\s/g,''))||/^(知晓海洋\s*[|｜]\s*探知海洋|宣传海洋\s*[|｜]\s*服务海洋)$/.test(line);
  const decoration=/^[=─━_\-►\s]{5,}$/.test(line);
  if(cta||brand||decoration){removed.push({reason:cta?'互动提示':brand?'公众号宣传语':'分隔装饰',text:l});return false;}return true;
 }).join('\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n').trim();
 return {content:body,removed,version:cleaningVersion};
}
export function prepareMPItem(item){
 if(item.kind!=='mp_article')return item;
 const originalContent=item.originalContent??item.content??'',clean=cleanMPContent(originalContent);
 const result={...item,originalContent,content:clean.content,contentStatus:clean.content?'complete':'pending_body',cleaning:{version:cleaningVersion,removed:clean.removed,originalLength:originalContent.length,cleanedLength:clean.content.length}};
 // Hash raw + cleaned body: source revisions and parser revisions both invalidate downstream evidence.
 result.hash=createHash('sha256').update(JSON.stringify([item.title,originalContent,result.content,item.publishedAt,cleaningVersion])).digest('hex');
 return result;
}
