import {countries} from './core.mjs';
const aliases = [
 ['中国海油','海油','中国海洋石油','中国海洋石油有限公司','CNOOC'],
 ['巴西','Brazil','Brazilian'],['挪威','Norway','Norwegian'],['美国','United States','USA'],
 ['中国','China','Chinese'],['英国','United Kingdom','UK'],['新加坡','Singapore'],
 ['澳大利亚','Australia'],['荷兰','Netherlands','Dutch'],['瑞典','Sweden'],
 ['Northern Lights','北极光'],['Petrobras','巴西国家石油公司'],['Shell','壳牌'],['Equinor','挪威国家能源公司']
];
const contains=(text,term)=> /^[a-z0-9 ]+$/i.test(term)?new RegExp('\\b'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(text):text.toLowerCase().includes(term.toLowerCase());
export function queryGroups(query){
 let rest=query;const groups=[];
 // Longest matches first: 中国海油 must not create an additional China constraint.
 const matches=aliases.flatMap(group=>group.filter(a=>contains(query,a)).map(a=>({a,group}))).sort((a,b)=>b.a.length-a.a.length);
 for(const {a,group} of matches)if(contains(rest,a)){if(!groups.includes(group))groups.push(group);rest=rest.replace(new RegExp(a,'gi'),' ');}
 for(const c of countries)if(rest.includes(c.name)){groups.push([c.name]);rest=rest.replaceAll(c.name,' ');}
 // Space-separated short searches are explicit AND queries; natural-language residuals stay in ranking.
 if(query.trim().split(/\s+/).length>1)for(const term of rest.trim().split(/\s+/).filter(Boolean))if(term.length>=2&&term.length<=16&&!/[？?，,]/.test(term))groups.push([term]);
 return groups;
}
export function constrainDocuments(docs,query){const groups=queryGroups(query);return docs.filter(d=>{const text=[d.title,d.titleZh,d.content].join(' ');return groups.every(g=>g.some(a=>contains(text,a)));});}
export function expandedQuery(query){return query+' '+queryGroups(query).flat().join(' ');}
