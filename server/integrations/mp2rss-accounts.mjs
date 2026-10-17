// Account credentials stay in server configuration; only ordinal labels leave this module.
export function mergeAccountClients(accounts){
 let catalog=null,loading=null;
 async function load(){
  if(catalog)return catalog;
  if(loading)return loading;
  loading=(async()=>{
   const merged=new Map(),owners=new Map();
   for(const [index,api] of accounts.entries()){
    let loaded=0;
    for(let page=1;;page++){
     const r=await api(`/open-api/subscriptions?page=${page}&pageSize=50`);
     if(!Array.isArray(r?.items)||!Number.isFinite(r.total))throw Error('订阅列表格式变化');
     for(const s of r.items){
      if(!['mp','x'].includes(s.sourceType))throw Error('未知订阅类型');
      const remoteId=String(s.sourceType==='mp'?s.mpId:s.xUserId);
      if(!/^\d{1,64}$/.test(remoteId))throw Error('账号标识格式错误');
      const key=s.sourceType+':'+remoteId;
      if(!merged.has(key))merged.set(key,{...s,accountLabels:[]});
      const row=merged.get(key);if(!row.accountLabels.includes(index+1))row.accountLabels.push(index+1);
      if(!owners.has(key))owners.set(key,[]);if(!owners.get(key).includes(index))owners.get(key).push(index);
     }
     loaded+=r.items.length;
     if(loaded>=r.total)break;
     if(!r.items.length)throw Error('订阅列表未读取完整');
    }
   }
   return catalog={items:[...merged.values()],owners};
  })();
  try{return await loading;}finally{loading=null;}
 }
 return async function api(route,options={}){
  const method=options.method||'GET';
  const u=new URL(route,'https://mp2rss.bugcode.dev');
  if(!route.startsWith('/open-api/')||route.includes('://'))throw Error('无效接口路径');
  if(u.pathname==='/open-api/subscriptions'&&method==='GET'){
   // Page one starts a new complete snapshot. Failed accounts never publish a partial union.
   const page=Math.max(1,Number(u.searchParams.get('page'))||1),size=Math.min(100,Math.max(1,Number(u.searchParams.get('pageSize'))||50));
   if(page===1)catalog=null;
   const all=await load();return {items:all.items.slice((page-1)*size,page*size),total:all.items.length};
  }
  const match=u.pathname.match(/^\/open-api\/(subscriptions|x)\/(\d+)(?:\/|$)/);
  if(match){
   const all=await load(),key=(match[1]==='x'?'x:':'mp:')+match[2],indices=all.owners.get(key);
   if(!indices?.length)throw Error('账号未在已配置订阅中找到');
   if(method!=='GET'&&indices.length>1)throw Error('账号属于多个订阅账户，请到供应商控制台分别管理');
   try{return await accounts[indices[0]](route,options);}finally{if(method!=='GET')catalog=null;}
  }
  // New subscriptions retain the existing primary-account behavior.
  try{return await accounts[0](route,options);}finally{if(method!=='GET')catalog=null;}
 };
}
