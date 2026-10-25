const params=new URLSearchParams(location.search),requested=params.get('system');
const status=document.querySelector('#status'),buttons=[...document.querySelectorAll('[data-system]')];
if(['ocean','low-carbon'].includes(requested))document.querySelector(`[data-system="${requested}"]`).focus();
for(const button of buttons)button.addEventListener('click',async()=>{
 buttons.forEach(b=>b.disabled=true);status.textContent='正在切换，请稍候…';
 const system=button.dataset.system,base=system==='ocean'?'/ocean-intelligence/':'/low-carbon/';
 try{
  const response=await fetch('/api/subsystems/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system})});const result=await response.json();
  if(!response.ok)throw Error(result.message||result.statusMessage||'研究服务暂未就绪');
  let href=base;try{const saved=sessionStorage.getItem('subsystem-last:'+system),url=saved?new URL(saved,location.origin):null;if(url?.origin===location.origin&&url.pathname.startsWith(base))href=url.pathname+url.search+url.hash;}catch{}
  if(location.hash)href=base+location.hash;location.assign(href);
 }catch(error){status.textContent=error.message;buttons.forEach(b=>b.disabled=false);}
});
