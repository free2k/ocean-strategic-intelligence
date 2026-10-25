// A profile is fixed for the lifetime of the process, never selected by a request.
export const sharedLowCarbon=process.env.APP_ID==='low-carbon'&&process.env.LC_COLLECTION_MODE==='shared';
export const sharedCapabilities=Object.freeze({collection:'shared-read-only',classification:'local-rules',questionAnswering:'local-evidence',reports:'extractive',paidGeneration:false,sourceManagement:false});
export function assertNoPaidConfiguration(env=process.env){
 for(const [name,value] of Object.entries(env))if(value&&(/(?:OPENAI|DASHSCOPE|QWEN).*API_KEY/.test(name)||['LC_SHARED_GATEWAY','LC_GATEWAY_TOKEN','MP2_RSS_LINK'].includes(name)))throw Error('LOW_CARBON_PAID_CONFIGURATION_REJECTED:'+name);
 if(env.INTEL_ENABLE_AI!=='false'||env.INTEL_SCHEDULE!=='false'||env.INTEL_BATCH_ENABLED==='true'||env.INTEL_MODEL_WORKER_ENABLED==='true')throw Error('LOW_CARBON_PAID_SCHEDULER_REJECTED');
}
