export const modules=['home','sources','library','monitor','dashboard','analysis','research'];
export const sharedKeys=['topic','country','sourceId','from','to'];
export function parseRoute(hash=''){
 const [raw='',query='']=hash.replace(/^#/,'').split('?'),params=new URLSearchParams(query);let module=raw||'home',redirect=false,error=null;
 if(module==='events'||module==='graph'){if(!params.has('view'))params.set('view',module==='events'?'events':'relations');module='monitor';redirect=true;}
 if(!modules.includes(module)){module='home';error='页面地址无效，已返回首页';redirect=true;}
 const view=module==='monitor'?(params.get('view')||'objects'):null;
 if(view&&!['objects','events','relations'].includes(view))return {module:'monitor',view:'objects',scope:{},error:'该产业监测视图尚不可用，已返回对象档案',redirect:true};
 const scope={};for(const key of sharedKeys)if(params.has(key))scope[key]=params.get(key);
 for(const key of ['from','to'])if(scope[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(scope[key])){delete scope[key];error='日期参数无效，请重新选择日期';}
 if(scope.country&&!/^[A-Z]{2}$/.test(scope.country)){delete scope.country;error='国家参数无效，请重新选择国家';}
 let objectId=module==='monitor'&&view==='objects'?params.get('objectId'):null,releaseId=module==='dashboard'||module==='monitor'&&view==='objects'?params.get('releaseId'):null;
 if(objectId&&!/^object_[a-f0-9]{64}$/.test(objectId)){objectId=null;error='对象标识无效，已返回对象列表';}
 if(releaseId&&!/^release_[a-f0-9]{64}$/.test(releaseId)){releaseId=null;error='发布版本标识无效';}
 let countryCodes=module==='dashboard'&&params.has('countryCodes')?[...new Set(params.get('countryCodes').split(',').filter(Boolean))].sort():null,relationMode=module==='dashboard'?(params.get('relationMode')||'external'):null;
 if(countryCodes?.some(c=>! /^[A-Z]{2}$/.test(c))){countryCodes=null;error='国家集合参数无效';}
 if(relationMode&&!['external','within'].includes(relationMode)){relationMode='external';error='关系范围参数无效';}
 if(relationMode==='within'&&(countryCodes?.length||0)<2)relationMode='external';
 const unsupported=[...params.keys()].filter(key=>!sharedKeys.includes(key)&&key!=='view'&&!(module==='dashboard'&&['countryCodes','relationMode','releaseId'].includes(key))&&!(module==='monitor'&&view==='objects'&&['objectId','releaseId'].includes(key)));if(unsupported.length)error='该链接包含尚未接入的研究条件：'+unsupported.join('、');
 return {module,view,scope,objectId,releaseId,countryCodes,relationMode,error,redirect};
}
export function routeHash(route,scope=route.scope||{}){const q=new URLSearchParams();if(route.module==='dashboard'&&route.countryCodes!==null&&route.countryCodes!==undefined){q.set('countryCodes',route.countryCodes.join(','));q.set('relationMode',route.relationMode||'external');}if(route.module==='dashboard'&&route.releaseId)q.set('releaseId',route.releaseId);if(route.module==='monitor'){q.set('view',route.view||'objects');if(route.view==='objects'){if(route.objectId)q.set('objectId',route.objectId);if(route.releaseId)q.set('releaseId',route.releaseId);}}for(const key of sharedKeys)if(scope[key]!==undefined)q.set(key,scope[key]);return '#'+route.module+(q.size?'?'+q:'');}
export function sharedScope(route,saved={}){return Object.fromEntries(sharedKeys.map(key=>[key,route.scope[key]??saved[key]??'']));}
export function readNavigation(storage){try{const value=JSON.parse(storage.getItem('ocean-navigation-v1')||'{}');return {shared:value.shared||{},local:value.local||{},lastResearch:value.lastResearch||null};}catch{return {shared:{},local:{},lastResearch:null};}}
export function saveNavigation(storage,state){try{storage.setItem('ocean-navigation-v1',JSON.stringify(state));}catch{/* Restricted storage must not block navigation. */}}
