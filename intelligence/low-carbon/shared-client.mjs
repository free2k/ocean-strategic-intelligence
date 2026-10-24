export async function sharedRequest(route,{method='GET',body,timeout=125000}={}){
 const origin=process.env.LC_SHARED_GATEWAY||'http://127.0.0.1:3270';
 if(!route.startsWith('/')||route.startsWith('//'))throw Error('INVALID_SHARED_ROUTE');
 const response=await fetch(origin+route,{method,headers:{Authorization:'Bearer '+process.env.LC_GATEWAY_TOKEN,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(timeout)});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||value.message||'共享服务暂不可用'),{status:response.status});return value;
}
