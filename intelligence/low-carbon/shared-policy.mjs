export function allowedSharedSource(path,method,body={}){
 if(path==='/api/subscriptions')return method==='GET';
 if(path==='/api/subscriptions/action')return method==='POST'&&['subscribe','unsubscribe','update','refresh'].includes(body.action);
 if(path==='/api/rss/sources')return ['GET','POST'].includes(method);
 return /^\/api\/rss\/sources\/\d+$/.test(path)&&['PATCH','DELETE'].includes(method);
}
export function allowedSharedProvider(path,method){return method==='GET'&&/^\/open-api\/(subscriptions(?:\/\d+\/articles)?|x\/\d+\/(articles|posts))$/.test(path);}
export function subscriptionWithLocalCounts(s,local={}){return {id:s.id,payload:s.payload,enabled:s.enabled,articles:s.articles,posts:s.posts,present:s.present,count:local.count||0,ready:local.ready||0,latest:local.latest||null,last_sync:local.last_sync||null,legacy_count:0};}
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
export function sharedRegistryPayload(path,data){
 if(!Array.isArray(data?.list))throw Error('SHARED_REGISTRY_SCHEMA_CHANGED');
 if(path==='/api/subscriptions')return {configured:!!data.configured,sharedRegistry:true,list:data.list.map(s=>({...pick(s,['id','enabled','articles','posts','present']),payload:pick(s.payload,['id','platform','remoteId','name','handle','accountLabels'])}))};
 if(path==='/api/rss/sources')return {sharedRegistry:true,list:data.list.map(s=>pick(s,['id','name','alias','url','sitemap','method','manager','isOverseas','scope']))};
 throw Error('SHARED_REGISTRY_ROUTE_REJECTED');
}
