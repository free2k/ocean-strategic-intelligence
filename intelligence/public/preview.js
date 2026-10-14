// Restricted Markdown: raw HTML is always escaped; links permit only HTTP(S).
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text){
 const tokens=[];const stash=html=>`\u0000${tokens.push(html)-1}\u0000`;
 let s=String(text).replace(/\u0000/g,'').replace(/`([^`]+)`/g,(_,v)=>stash(`<code>${escapeHtml(v)}</code>`));
 s=s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s<>"()]+)\)/g,(_,label,url)=>stash(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`));
 s=escapeHtml(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
 return s.replace(/\u0000(\d+)\u0000/g,(_,n)=>tokens[+n]);
}
export function markdown(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n'),out=[];let i=0;
 const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
  if(/^\s*```/.test(line)){const code=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);i++;out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);continue;}
  if(line.includes('|')&&i+1<lines.length&&cells(lines[i+1]).every(x=>/^:?-{3,}:?$/.test(x))){const headers=cells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].includes('|'))rows.push(cells(lines[i++]));out.push(`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map((_,n)=>`<td>${inline(r[n]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;}
  const h=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);if(h){out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
  if(/^\s*([-*_])\1{2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
  if(/^\s*>/.test(line)){out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/,''))}</blockquote>`);i++;continue;}
  const list=line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);if(list){const tag=list[1]?'ul':'ol',items=[];while(i<lines.length){const m=lines[i].match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);if(!m||(m[1]?'ul':'ol')!==tag)break;items.push(`<li>${inline(m[2])}</li>`);i++;}out.push(`<${tag}>${items.join('')}</${tag}>`);continue;}
  out.push(`<p>${inline(line)}</p>`);i++;
 }
 return out.join('');
}
export function groupResearch(records){const groups=new Map();for(const r of records){const key=r.question.trim().replace(/\s+/g,' ').toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}return [...groups.values()].map(rs=>rs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));}

// Display timestamps in one explicit timezone; never reinterpret monthly/quarterly periods.
export function formatDisplayDate(value,fallback='未提供'){
 if(value===null||value===undefined||value==='')return fallback;
 const text=String(value);
 if(!/^\d{4}-\d{2}-\d{2}T/.test(text))return text;
 if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(text))return text.replace('T',' ').replace(/:\d{2}(?:\.\d+)?$/,'')+'（时区未注明）';
 const date=new Date(text);if(!Number.isFinite(date.getTime()))return '日期待核对';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function originalSourceLink(value){
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error();return `<p class="original-source"><a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></p>`;}catch{return '<p class="meta">此资料未保存可跳转的原始链接</p>';}
}
