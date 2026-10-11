import test from 'node:test';import assert from 'node:assert/strict';
import {planTemplates} from '../quant-preview/planner.mjs';import {formatValue} from '../quant-preview/charts.js';import {demoOption} from '../quant-preview/template-demos.js';import {templates} from '../quant-preview/templates.mjs';
test('zero series is retained but cannot masquerade as a varying heatmap',()=>{
 const c={sources:[],observations:[],documents:[],industries:[],cards:[],series:[{id:'zero',name:'zero',unit:'m3',rows:[{period:'2026-01',value:0},{period:'2026-02',value:0}]}]};
 const r=planTemplates(c).cards[0];assert.equal(r.zero,true);assert.equal(r.constant,true);assert.deepEqual(r.types,['line']);assert.equal(r.rows.length,2);assert.equal(r.rows[0].value,0);
});
test('small nonzero values remain nonzero in numeric displays',()=>{assert.equal(formatValue(0),'0');assert.equal(formatValue(0.025192),'0.025192');assert.notEqual(formatValue(.00000001),'0');});
test('every declared demo type has a synthetic chart independently of live data',()=>{for(const t of templates)for(const type of t.types){const o=demoOption(type,true);assert.ok(o.series?.length,type);assert.equal(o.animation,false);}});
test('empty cards do not count as real template matches',()=>{const r=planTemplates({sources:[],observations:[],documents:[],industries:[],series:[],cards:[{id:'coverage',rows:[],types:['sankey']}]});assert.equal(r.cards.length,0);assert.ok(r.planner.templates.every(t=>t.matches===0));});
