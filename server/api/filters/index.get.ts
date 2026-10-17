import {standardTopics,taxonomyVersion,topicDefinition,supplementalRules,marineContextPattern} from '../../../intelligence/industry-topics.mjs';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();
  const rules = await db.select().from(schema.filterRules);
  const context=rules.filter(r=>r.type==='context');
  const contextDescription=context.length?context.filter(r=>r.enabled).map(r=>'标题：'+r.titleKeywords.join('、')+'；正文前1800字符：'+r.contentKeywords.join('、')).join('；')||'通用语境词已停用，规则不直接通过语境门槛':marineContextPattern;
  return { rules:rules.map(r=>({...r,domain:topicDefinition(r.topic)})),definitions:standardTopics,taxonomyVersion,supplementalRules,marineContextPattern:contextDescription };
});
