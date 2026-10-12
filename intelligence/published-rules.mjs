import {compileRules} from './industry-classification.mjs';

// Jobs contain the immutable rules that were actually applied, unlike editable drafts.
export function attachPublishedRules(data, job) {
 if (!Array.isArray(job?.config?.rules)) throw Error('已生效分类规则缺失，请先发布数据库规则版本');
 const compiled=compileRules(job.config);
 data.industryRuleConfig=job.config;
 data.industryRuleVersion=compiled.version;
 data.industryRulePublication={source:'database',jobId:job.id??null,version:job.version||compiled.version,classifierVersion:compiled.version,scope:job.scope||{},appliedAt:job.finished_at||job.started_at||null};
 return compiled;
}

export function snapshotRules(data) {
 if(!Array.isArray(data.industryRuleConfig?.rules)||!data.industryRuleVersion||data.industryRulePublication?.source!=='database')
  throw Error('数据快照缺少已生效的数据库分类规则，请同步规则版本后重试');
 if(compileRules(data.industryRuleConfig).version!==data.industryRuleVersion||data.industryRulePublication.classifierVersion!==data.industryRuleVersion)
  throw Error('数据快照的分类规则版本不一致，请重新生成快照');
 return data.industryRuleConfig;
}
