import {test} from 'node:test';
import assert from 'node:assert/strict';
import {standardTopics,topicAliases,canonicalTopic,topicCounts} from '../industry-topics.mjs';
test('six stable topics include zero counts and merge disjoint historical counts',()=>{
 const rows=topicCounts([{topic:'海上风电',count:'16'},{topic:'海洋新能源',count:90},{topic:'海洋低碳领域',count:14},{topic:'海洋低碳',count:4}]);
 assert.equal(rows.length,6);assert.equal(rows.find(t=>t.id==='海上风电').articleCount,106);assert.equal(rows.find(t=>t.id==='海洋低碳').articleCount,18);assert.equal(rows.find(t=>t.id==='宏观政策').articleCount,0);
});
test('every old or current alias resolves to the same filter group',()=>{for(const t of standardTopics)for(const alias of t.aliases){assert.equal(canonicalTopic(alias),t.id);assert.deepEqual(topicAliases(alias),t.aliases);}assert.deepEqual(topicAliases('unknown'),['unknown']);});
