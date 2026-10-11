import fs from 'node:fs/promises';
const base='http://127.0.0.1:3101';
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});if(!login.ok)throw Error('Login failed');const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('No session');
for(const filters of [{topic:'宏观政策'},{topic:'海上风电'},{topic:'海洋油气'},{sourceId:'uk-repd',country:'GB'},{topic:'宏观政策',from:'2026-01-01',to:'2026-10-11'}]){
 const r=await fetch(base+'/quant/api/catalog?'+new URLSearchParams(filters),{headers:{cookie}});if(!r.ok)throw Error('Catalog failed '+r.status);const c=await r.json();console.log(JSON.stringify({filters,cards:c.cards.filter(x=>['registry','timeline'].includes(x.templateId)).map(x=>({name:x.title,rows:x.rows.length})),points:c.series.reduce((n,s)=>n+s.rows.length,0)}));
}
if(process.argv.includes('--session')){const i=cookie.indexOf('=');await fs.writeFile('/opt/ocean-intelligence/open-test-session.json',JSON.stringify({cookies:[{name:cookie.slice(0,i),value:cookie.slice(i+1),domain:'49.233.77.111',path:'/ocean-intelligence/',httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]}),{mode:0o600});}
if(process.argv.includes('--process')){const r=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});console.log(JSON.stringify({processingStatus:r.status}));if(![202,409].includes(r.status))throw Error('Processing start failed');}
