import fs from 'node:fs/promises';
const r=await fetch('http://127.0.0.1:3101/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
if(!r.ok)throw Error('Login failed');const cookie=r.headers.get('set-cookie').split(';')[0],i=cookie.indexOf('=');
await fs.writeFile('/opt/knowledge-base/taxonomy-test-session.json',JSON.stringify({name:cookie.slice(0,i),value:cookie.slice(i+1),domain:'49.233.77.111',path:'/ocean-intelligence/',httpOnly:true,secure:false,sameSite:'Lax'}),{mode:0o600});
