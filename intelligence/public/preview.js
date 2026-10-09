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
