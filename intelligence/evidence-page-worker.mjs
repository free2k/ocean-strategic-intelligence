import {parentPort,workerData} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {createEvidencePageReader} from './evidence-page-reader.mjs';
const pending=new Map();
const server=createEvidencePageReader({...workerData,refresh:()=>new Promise((resolve,reject)=>{
 const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Evidence refresh timed out'));},120000);timer.unref();pending.set(id,{resolve,reject,timer});parentPort.postMessage({id,action:'refresh'});
})});
parentPort.on('message',message=>{
 if(message.invalidate)server.invalidate();
 const request=pending.get(message.id);if(!request)return;clearTimeout(request.timer);pending.delete(message.id);message.ok?request.resolve():request.reject(Error('Evidence refresh unavailable'));
});
// Other application pages can start in a fresh development/test directory even
// before an audit view is available. Evidence reads then return a private 503.
try{server.prepare();}catch(error){if(error.code!=='ENOENT')throw error;}
server.listen(workerData.port,'127.0.0.1',()=>parentPort.postMessage({ready:true,port:server.address().port}));
