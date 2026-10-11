const base='http://127.0.0.1:3101';
try{
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});if(!login.ok)throw Error();
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 const r=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});
 console.log(JSON.stringify({processingRequested:r.status===202,busy:r.status===409,status:r.status}));if(![202,409].includes(r.status))process.exitCode=1;
}catch{console.error('Processing request failed');process.exitCode=1;}
