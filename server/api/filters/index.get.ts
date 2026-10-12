import {standardTopics,taxonomyVersion,topicDefinition,supplementalRules,marineContextPattern} from '../../../intelligence/industry-topics.mjs';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();
  const rules = await db.select().from(schema.filterRules);
  return { rules:rules.map(r=>({...r,domain:topicDefinition(r.topic)})),definitions:standardTopics,taxonomyVersion,supplementalRules,marineContextPattern };
});
