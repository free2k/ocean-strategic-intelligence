import {textSlice} from '../unicode-text.mjs';
const chinese=s=>/[\u3400-\u9fff]/u.test(s||'');
export const cleanThemeTitle=value=>String(value||'').replace(/https?:\/\/\S+/gi,'').replace(/(^|\s)@[\w]+/g,' ').replace(/\s*[|｜]\s*[\w.-]+\.(?:com|org|net)\s*$/i,'').replace(/\s+/g,' ').trim();
export function presentThemes(themes,entries){
 const docs=new Map(entries.map(e=>[e.documentId+'|'+e.bodyVersionId,e.body]));
 return themes.map(t=>{const candidates=[...t.members].sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))),body=candidates.map(m=>docs.get(m.documentId+'|'+m.bodyVersionId)).find(b=>chinese(b?.titleZh))||candidates.map(m=>docs.get(m.documentId+'|'+m.bodyVersionId)).find(Boolean);
 const originalTitle=t.name,title=cleanThemeTitle(chinese(t.name)?t.name:chinese(body?.titleZh)?body.titleZh:t.name);
 const excerpt=chinese(body?.contentZh)?textSlice(body.contentZh.replace(/\s+/g,' ').trim(),0,220):'';
 return {...t,presentation:{title,originalTitle,excerpt,chinese:chinese(title),titleBasis:!chinese(t.name)&&chinese(body?.titleZh)?'article_translation':'theme'}};
 });
}
