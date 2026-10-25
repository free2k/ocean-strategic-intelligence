import {randomUUID} from 'node:crypto';
// The web app only signals its own local projector. It cannot trigger collection.
export async function createSharedScheduler({store}){
 let status={enabled:true,running:false,mode:'shared',modelCalls:0};
 const refresh=async()=>{const r=(await store.pool.query("SELECT payload FROM lc_shared.state WHERE id='status'")).rows[0];if(r)status={...status,...r.payload};return status;};
 await refresh();
 const timer=setInterval(()=>void refresh().catch(()=>{}),5000);timer.unref();
 return {status:()=>({...status}),journal:null,close:()=>clearInterval(timer),run:async()=>{const requestId=randomUUID();await store.pool.query("INSERT INTO lc_shared.state(id,payload) VALUES('request',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[{requestId,requestedAt:new Date().toISOString()}]);return true;}};
}
