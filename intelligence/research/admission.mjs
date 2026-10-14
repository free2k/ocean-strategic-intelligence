import {randomUUID} from 'node:crypto';
import {fail,digest} from './ledger.mjs';
export const beijingDay=now=>new Date(new Date(now).getTime()+8*3600000).toISOString().slice(0,10);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const money=(tokens,rate)=>Math.ceil(tokens*rate/1000000);
export class ModelAdmission{
 constructor(state,{clock=()=>new Date().toISOString()}={}){this.state=state;this.clock=clock;}
 async registerBudget({authorizationId,availableMicros,currency,expiresAt}){
  if(!authorizationId||!currency||!integer(availableMicros)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.parse(this.clock()))fail('INVALID_BUDGET','需登记既有授权标识、有效可用额度及到期日');
  return this.state.transact(s=>{if(s.budget)fail('BUDGET_ALREADY_REGISTERED','不可覆盖既有预算及未结算预留；额度变更需单独核对',409);s.budget={authorizationId,availableMicros,currency,expiresAt,registeredAt:this.clock()};return s.budget;});
 }
 async reserve({requestKey,kind='text',incremental=true,inputTokens,maxOutputTokens,model,endpoint,configVersion,inputRateMicros,outputRateMicros,sharedSchedulingReady=false}){
  if(!requestKey||!['text','ocr','embedding'].includes(kind)||!integer(inputTokens)||!integer(maxOutputTokens))fail('INVALID_RESERVATION','请求标识、类型和 token 上界不合法');
  const now=this.clock(),day=beijingDay(now);
  return this.state.transact(s=>{
   const prior=Object.values(s.reservations).find(r=>r.requestKey===requestKey);if(prior)return {status:'existing',reservation:prior};
   const defer=reason=>({status:'deferred',reason});
   if(!model||!endpoint||!configVersion)return defer('MODEL_CONFIG_MISSING');
   if(!/^https?:\/\//.test(endpoint))return defer('MODEL_ENDPOINT_INVALID');
   if(!sharedSchedulingReady)return defer('SHARED_SCHEDULING_NOT_CONNECTED');
   if(!s.budget||Date.parse(s.budget.expiresAt)<=Date.parse(now))return defer('BUDGET_NOT_REGISTERED_OR_EXPIRED');
   if(!integer(inputRateMicros)||!integer(outputRateMicros))return defer('COST_METERING_UNAVAILABLE');
   const active=Object.values(s.reservations).filter(r=>['reserved','uncertain'].includes(r.status));
   if(active.length>=2||kind!=='embedding'&&active.some(r=>r.kind===kind))return defer('SHARED_CONCURRENCY_LIMIT');
   const cost=money(inputTokens,inputRateMicros)+money(maxOutputTokens,outputRateMicros),tokens=inputTokens+maxOutputTokens;
   if(!integer(cost)||!integer(tokens))fail('INVALID_RESERVATION','预留值超出整数范围');
   const used=Object.values(s.reservations).reduce((n,r)=>n+r.chargedMicros,0),daily=s.days[day]||{requests:0,tokens:0};
   if(used+cost>s.budget.availableMicros)return defer('ACCOUNT_BUDGET_LIMIT');
   if(incremental&&(daily.requests>=100||daily.tokens+tokens>1000000))return defer('DAILY_RESEARCH_LIMIT');
   const id='permit_'+randomUUID(),record={id,requestKey,kind,incremental,day,status:'reserved',createdAt:now,inputTokens,maxOutputTokens,reservedTokens:tokens,chargedTokens:tokens,chargedMicros:cost,model,endpoint,configVersion,inputRateMicros,outputRateMicros,budgetAuthorization:s.budget.authorizationId};
   s.reservations[id]=record;if(incremental)s.days[day]={requests:daily.requests+1,tokens:daily.tokens+tokens};return {status:'reserved',reservation:record};
  });
 }
 async settle(id,{usage=null,uncertain=false}={}){return this.state.transact(s=>{
  const r=s.reservations[id];if(!r)fail('PERMIT_NOT_FOUND','预留记录不存在',404);if(r.status==='settled')return r;
  if(uncertain){r.status='uncertain';r.reason='REQUEST_COMPLETION_UNKNOWN';return r;}
  if(usage){if(!integer(usage.inputTokens)||!integer(usage.outputTokens))fail('INVALID_USAGE','模型 usage 不合法');const tokens=usage.inputTokens+usage.outputTokens,cost=money(usage.inputTokens,r.inputRateMicros)+money(usage.outputTokens,r.outputRateMicros);if(!integer(tokens)||!integer(cost))fail('INVALID_USAGE','usage 超出范围');if(r.incremental)s.days[r.day].tokens+=tokens-r.chargedTokens;r.chargedTokens=tokens;r.chargedMicros=cost;r.usage=usage;}
  r.status='settled';r.settledAt=this.clock();r.reason=usage?'USAGE_RECONCILED':'NO_USAGE_RESERVATION_RETAINED';return r;
 });}
 async inspect(){return this.state.transact(s=>({budget:s.budget,days:s.days,reservations:Object.values(s.reservations)}));}
}
// UTF-8 bytes are deliberately conservative; model output capacity is reserved separately.
export const conservativeInputTokens=messages=>Buffer.byteLength(JSON.stringify(messages),'utf8')+512;
export const modelConfigVersion=config=>digest({model:config.model,endpoint:config.endpoint,inputRateMicros:config.inputRateMicros,outputRateMicros:config.outputRateMicros,promptVersion:config.promptVersion});
