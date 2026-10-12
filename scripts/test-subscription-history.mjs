import assert from 'node:assert/strict';
import {attachHistory} from '../server/integrations/subscription-history.mjs';
const list=[{source_id:10,present:true,payload:{platform:'mp',remoteId:'123',name:'新名称'}},{source_id:11,present:true,payload:{platform:'mp',remoteId:'456',name:'同名'}},{source_id:12,present:true,payload:{platform:'x',name:'同名'}}];
const result=attachHistory(list,[
 {id:1,type:'wechat',fakeid:Buffer.from('123').toString('base64'),name:'旧名称',count:7},
 {id:2,type:'wechat',fakeid:Buffer.from('999').toString('base64'),name:'同名',count:3},
 {id:3,type:'wechat',fakeid:null,name:'同名',count:2},
 {id:4,type:'rss',name:'同名',count:5},
]);
assert.deepEqual(list.map(s=>s.legacy_count),[7,2,0]);
assert.deepEqual(result,{total:17,unmatched:8,subscribed:9});
attachHistory(list,[]);assert.deepEqual(list.map(s=>s.legacy_count),[0,0,0]);
console.log('History identity, rename, mismatched identity, platform isolation and reset passed');
