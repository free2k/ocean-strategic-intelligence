import {test} from 'node:test';
import assert from 'node:assert/strict';
import {standardTopics,domainPrompt,topicDefinition,taxonomyVersion} from '../industry-topics.mjs';
import {compileRules,classifyRecord,industries} from '../industry-classification.mjs';
import {topics} from '../core.mjs';
import {semanticDecision} from '../semantic-classification.mjs';
test('UI, engine and event topics share the six definitions',()=>{assert.equal(standardTopics.length,6);assert.deepEqual(topics,industries);for(const t of standardTopics){assert.ok(t.definition&&t.boundary);assert.ok(domainPrompt().includes(t.definition));for(const alias of t.aliases)assert.equal(topicDefinition(alias),t);}});
test('canonical and legacy rule names compile with authoritative definitions',()=>{for(const t of standardTopics){const c=compileRules({rules:[{type:'include',enabled:true,topic:t.aliases.at(-1),description:'obsolete scope',titleKeywords:['test'],contentKeywords:[]}]});assert.equal(c.rules[0].topic,t.id);assert.equal(c.rules[0].description,t.definition);assert.equal(classifyRecord({title:'offshore test',content:''},c).primary,t.id);}});
test('Qwen receives all domain boundaries and emits taxonomy provenance',async()=>{const c=compileRules({rules:[]});const r=await semanticDecision({title:'test',content:'offshore wind project has installed floating turbines'},{status:'unmatched',positive:[],negative:[]},c,{model:'test',client:{chat:{completions:{create:async args=>{for(const t of standardTopics)assert.ok(args.messages[0].content.includes(t.boundary));return {choices:[{message:{content:JSON.stringify({relevant:true,topic:'海洋新能源',reason:'offshore wind',evidenceId:'p1'})}}]};}}}}});assert.equal(r.primary,'海上风电');assert.equal(r.semantic.taxonomyVersion,taxonomyVersion);});
