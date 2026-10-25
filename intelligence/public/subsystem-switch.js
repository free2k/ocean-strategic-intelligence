const items=[['ocean','海洋能源','/ocean-intelligence/'],['low-carbon','低碳研究','/low-carbon/']];
export function installSubsystemSwitch(){
 const current=document.documentElement.dataset.system==='low-carbon'?'low-carbon':'ocean';
 const target=document.querySelector('.header-actions');if(!target||document.querySelector('[data-subsystem-switch]'))return;
 target.closest('header')?.classList.add('has-subsystem-switch');
 const style=document.createElement('style');style.textContent='@media(max-width:800px){header.has-subsystem-switch{flex-wrap:wrap;height:auto;min-height:90px;padding-top:8px;padding-bottom:8px;gap:4px}header.has-subsystem-switch .header-actions{margin-left:auto;justify-content:flex-end;gap:6px;max-width:100%}}';document.head.append(style);
 const box=document.createElement('nav');box.dataset.subsystemSwitch='';box.setAttribute('aria-label','切换子系统');box.style.cssText='display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:12px';
 for(const [id,label,base] of items){const link=document.createElement('a');link.textContent=label;link.href=base;link.style.cssText='padding:6px 9px;border:1px solid var(--line,#ccc);border-radius:7px;text-decoration:none;color:inherit';if(id===current){link.setAttribute('aria-current','page');link.style.fontWeight='700';}else{try{const saved=sessionStorage.getItem('subsystem-last:'+id);if(saved?.startsWith('/')&&!saved.startsWith('//')){const url=new URL(saved,location.origin);const allowed=id==='low-carbon'?url.pathname.startsWith(base):url.pathname==='/'||['/ocean-intelligence/','/articles','/wechat','/scraper','/export','/admin'].some(prefix=>url.pathname.startsWith(prefix));if(allowed&&url.origin===location.origin)link.href=saved;}}catch{}}box.append(link);}
 for(const link of box.children){link.style.margin='0';link.style.lineHeight='1.4';}
 target.prepend(box);
 const remember=()=>{try{if(location.pathname.startsWith(current==='low-carbon'?'/low-carbon/':'/ocean-intelligence/'))sessionStorage.setItem('subsystem-last:'+current,location.pathname+location.search+location.hash);}catch{}};remember();addEventListener('hashchange',remember);addEventListener('pagehide',remember);
 let switching=false;
 for(const [index,link] of [...box.children].entries())link.addEventListener('click',async event=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(switching)return;switching=true;remember();box.setAttribute('aria-busy','true');
  const label=link.textContent;link.textContent='正在切换…';
  try{const response=await fetch('/api/subsystems/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:items[index][0]})});const result=await response.json();if(!response.ok)throw Error(result.message||result.statusMessage||'切换暂未完成，请稍后重试');location.assign(link.href);}
  catch(error){link.textContent=label;let notice=box.querySelector('[data-switch-error]');if(!notice){notice=document.createElement('small');notice.dataset.switchError='';notice.setAttribute('role','status');notice.style.cssText='max-width:260px;white-space:normal;line-height:1.5';box.append(notice);box.style.flexWrap='wrap';}notice.textContent=error.message;}
  finally{switching=false;box.removeAttribute('aria-busy');}
 });
}
