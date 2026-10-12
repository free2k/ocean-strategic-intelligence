import {canonicalTopic,topicDefinition} from '../../../intelligence/industry-topics.mjs';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    type: 'include' | 'exclude';
    topic?: string;
    description?: string;
    titleKeywords: string[];
    contentKeywords: string[];
  }>(event);

  if (!body?.type || !body.titleKeywords?.length) {
    throw createError({ statusCode: 400, message: '请填写规则类型和至少一个标题关键词' });
  }

  if (body.type === 'include' && !body.topic) {
    throw createError({ statusCode: 400, message: '正向规则必须指定行业/主题名称' });
  }

  if(body.type==='include'&&!topicDefinition(body.topic))throw createError({statusCode:400,message:'Choose one of the six standard domains'});
  const db = useDB();
  const [rule] = await db.insert(schema.filterRules).values({
    type: body.type,
    topic: body.type==='include'?canonicalTopic(body.topic):body.topic||null,
    description: body.description || null,
    titleKeywords: body.titleKeywords,
    contentKeywords: body.contentKeywords || [],
  }).returning();

  return { success: true, rule };
});
