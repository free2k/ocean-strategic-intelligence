import { sql, eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/** 获取所有已有文章的行业主题列表 */
export default defineEventHandler(async () => {
  const db = useDB();

  const results = await db.select({
    topic: schema.articles.matchedTopic,
    count: sql<number>`count(*)`,
  })
    .from(schema.articles)
    .where(and(
      isNotNull(schema.articles.matchedTopic),
      eq(schema.articles.filterStatus, 'accepted'),
    ))
    .groupBy(schema.articles.matchedTopic);

  // 统计外网来源的文章数
  const [overseasCount] = await db.select({
    count: sql<number>`count(*)`,
  })
    .from(schema.articles)
    .innerJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(eq(schema.sources.isOverseas, true));

  const topics = results.map(r => ({
    name: r.topic,
    articleCount: Number(r.count),
  }));

  // 如果有外网文章，添加"外网资讯"虚拟分类
  if (overseasCount && Number(overseasCount.count) > 0) {
    topics.push({
      name: '外网资讯',
      articleCount: Number(overseasCount.count),
    });
  }

  return { topics };
});
