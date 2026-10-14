import OpenAI from 'openai';
// No automatic retries: an uncertain completion must be reconciled before spending again.
export function configuredProvider({apiKey,endpoint}) {
 if(!apiKey||!endpoint)throw Error('MODEL_CONFIG_MISSING');
 const client=new OpenAI({apiKey,baseURL:endpoint,maxRetries:0,timeout:180000});
 return {async generate({messages,model,maxOutputTokens=4000}) {
  const started=Date.now();
  const r=await client.chat.completions.create({model,messages,max_tokens:maxOutputTokens,response_format:{type:'json_object'},temperature:0.2});
  return {content:r.choices[0]?.message?.content,requestId:r.id,model:r.model,durationMs:Date.now()-started,usage:r.usage?{inputTokens:r.usage.prompt_tokens,outputTokens:r.usage.completion_tokens}:null};
 }};
}
