// Task-specific routing. User questions, research and factual extraction keep
// the configured quality model; vectors never change model or dimension here.
const economyTasks=new Set(['classification','translation','summary']);
export function taskModel(task,{fallback,env=process.env}={}){
 const override=env['INTEL_MODEL_'+task.toUpperCase()];
 return override||(economyTasks.has(task)?env.INTEL_ECONOMY_MODEL||'qwen3.7-flash':fallback||env.CHAT_MODEL||'qwen-plus');
}
export function translationMode(doc,{manual=false,env=process.env}={}){
 if(manual||doc.language==='zh'||doc.contentZh)return 'full';
 if(env.INTEL_TRANSLATION_MODE==='full')return 'full';
 return doc.contentKind==='pdf'||doc.url?.split('?')[0].toLowerCase().endsWith('.pdf')||String(doc.content||'').length>12000?'summary':'full';
}
export const autoVisionEnabled=(env=process.env)=>env.INTEL_AUTO_VISION==='true';
export const batchEnabled=(env=process.env)=>env.INTEL_BATCH_ENABLED==='true';
export const modelPolicyVersion='cost-policy-v1';
