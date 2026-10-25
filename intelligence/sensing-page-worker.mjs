import {parentPort,workerData} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {createSensingPageReader} from './sensing-page-reader.mjs';
const pending=new Map();
const server=createSensingPageReader({...workerData,refresh:()=>new Promise((resolve,reject)=>{
 const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Source refresh timed out'));},120000);timer.unref();pending.set(id,{resolve,reject,timer});parentPort.postMessage({id,action:'refresh'});
})});
parentPort.on('message',message=>{
 if(message.invalidate)server.invalidate();
 if(message.collection)server.updateCollection(message.collection);
 const request=pending.get(message.id);if(!request)return;clearTimeout(request.timer);pending.delete(message.id);message.ok?request.resolve({collection:message.collection}):request.reject(Error('Source refresh unavailable'));
});
server.listen(workerData.port,'127.0.0.1',()=>parentPort.postMessage({ready:true,port:server.address().port}));
