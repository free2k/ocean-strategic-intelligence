import {canonicalTopic,topicDefinition} from '../../../intelligence/industry-topics.mjs';
import { eq, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * POST /api/articles/manual-classify
 * 人工标注文章分类
 * Body:
 * - articleIds: number[] - 文章ID列表
 * - topic: string - 目标行业分类（来自 filterRules 的 topic）
 * - clear?: boolean - 是否清除人工标注（恢复为待筛选）
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    articleIds: number[];
    topic?: string;
    clear?: boolean;
  }>(event);

  if (!body?.articleIds?.length) {
    throw createError({ statusCode: 400, message: '请提供文章ID' });
  }

  if(!body.clear&&body.topic!=='__reject__'&&!topicDefinition(body.topic))throw createError({statusCode:400,message:'Choose one of the six standard domains'});
  const db = useDB();

  // 清除人工标注：恢复为待筛选状态
  if (body.clear) {
    await db.update(schema.articles)
      .set({
        filterStatus: 'pending',
        matchedTopic: null,
        rejectReason: null,
        classifyMethod: null,
        manualClassify: false,
        matchedKeywordsJson: null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.articles.id, body.articleIds));

    return { success: true, message: `已清除 ${body.articleIds.length} 篇文章的人工标注` };
  }

  // 设置人工分类
  if (!body.topic) {
    throw createError({ statusCode: 400, message: '请提供目标分类' });
  }

  // 人工标注为"排除"
  if (body.topic === '__reject__') {
    await db.update(schema.articles)
      .set({
        filterStatus: 'rejected',
        matchedTopic: null,
        classifyMethod: 'manual',
        manualClassify: true,
        rejectReason: '人工标注排除',
        matchedKeywordsJson: null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.articles.id, body.articleIds));

    return { success: true, message: `已将 ${body.articleIds.length} 篇文章人工标注为排除` };
  }

  await db.update(schema.articles)
    .set({
      filterStatus: 'accepted',
      matchedTopic: canonicalTopic(body.topic),
      classifyMethod: 'manual',
      manualClassify: true,
      rejectReason: null,
      matchedKeywordsJson: null,
      updatedAt: new Date(),
    })
    .where(inArray(schema.articles.id, body.articleIds));

  return { success: true, message: `已将 ${body.articleIds.length} 篇文章标注为「${body.topic}」` };
});
