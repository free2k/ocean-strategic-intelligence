import {reportRange} from './period-reports.mjs';

// One persistent idempotency key per Beijing day. Viewing pages never starts a model call.
export function createPeriodScheduler(reports,{enabled=true,startImmediately=true,clock=()=>new Date(),interval=30000,onError=()=>{}}={}){
 let busy=false;
 async function tick(){
  if(!enabled||busy)return;
  busy=true;
  try{
   const range=reportRange({preset:'7'},clock()),requestId='daily-weekly-'+range.to;
   const jobs=await reports.list();
   if(jobs.some(j=>j.status==='published'&&j.range.from===range.from&&j.range.to===range.to))return;
   let job=jobs.find(j=>j.requestId===requestId);
   if(!job){
    if(jobs.some(j=>['queued','running'].includes(j.status)))return;
    job=await reports.create({preset:'custom',from:range.from,to:range.to,requestId});
   }
   // Interrupted/failed jobs remain visible; do not spend again on an automatic retry.
   if(reports.running)await reports.running;
   job=await reports.get(job.id);
   if(job.status==='ready')await reports.publish(job.id);
  }catch(e){onError(e);}finally{busy=false;}
 }
 const timer=enabled&&interval>0?setInterval(()=>void tick(),interval):null;
 timer?.unref?.();
 if(enabled&&startImmediately)void tick(); // Catch up after a server restart or an offline midnight.
 return {tick,stop:()=>clearInterval(timer)};
}
