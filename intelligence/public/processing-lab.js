import {mountProcessingRuns} from './processing-runs.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
mountProcessingRuns(document.querySelector('#task-panel'),{api:'/api/processing-runs'});
fetch('/api/processing-runs/preview').then(r=>r.json()).then(data=>{
 document.querySelector('#total').textContent=data.count;document.querySelector('#pending').textContent=data.count;
 document.querySelector('#samples').innerHTML=data.documents.map(d=>`<article class="sample"><p>${esc(d.sourceName)} · ${d.publishedAt?esc(new Date(d.publishedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})):'日期未明确'}</p><h3>${esc(d.title)}</h3><span>待筛选输入副本</span><p>文档 ${esc(d.id)}</p></article>`).join('');
});
