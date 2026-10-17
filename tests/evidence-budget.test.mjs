import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingMs,boundedClient,errorDetails} from '../server/integrations/evidence-budget.mjs';
test('expired batch never starts a model call',async()=>{
 let calls=0;const ai=boundedClient({chat:{completions:{create:async()=>{calls++;}}}},Date.now()-1);
 await assert.rejects(()=>ai.chat.completions.create({}),{code:'BATCH_DEFERRED'});assert.equal(calls,0);
});
test('model deadline is clamped to remaining batch budget',async()=>{
 let options,stage;const ai=boundedClient({chat:{completions:{create:async(_,o)=>{options=o;return 'ok';}}}},Date.now()+2000,async s=>{stage=s;});
 assert.equal(await ai.chat.completions.create({}),'ok');assert.equal(stage,'model');assert.ok(options.timeout>0&&options.timeout<=2000);assert.ok(options.signal);
});
test('errors retain safe actionable categories without raw provider messages',()=>{
 assert.equal(errorDetails({status:429,message:'secret'},'model').code,'http_429');
 assert.equal(errorDetails({name:'TimeoutError'},'download').code,'request_timeout');
 assert.equal(errorDetails(new SyntaxError('secret'),'model').code,'invalid_json');
 assert.equal(JSON.stringify(errorDetails(Error('secret'),'model')).includes('secret'),false);
 assert.throws(()=>remainingMs(Date.now()),{code:'BATCH_DEFERRED'});
});
