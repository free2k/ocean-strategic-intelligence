import fs from 'node:fs/promises';
const r=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
if(!r.ok)throw Error('Normal login failed');const pair=r.headers.get('set-cookie')?.split(';')[0];if(!pair?.startsWith('site_auth='))throw Error('No session returned');
await fs.writeFile('/opt/knowledge-base/mp2rss-test-session.json',JSON.stringify({cookies:[{name:'site_auth',value:pair.slice('site_auth='.length),domain:'49.233.77.111',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]}),{mode:0o600});console.log('Temporary browser session created through normal login');
