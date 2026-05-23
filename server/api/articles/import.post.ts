import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import type { ImportBatch } from '~/types/article';

export default defineEventHandler(async (event) => {
  const body = await readBody<ImportBatch>(event);

  if (!body?.accounts?.length) {
    throw createError({ statusCode: 400, message: '无效的导入数据' });
  }

  const db = useDB();
  let importedCount = 0;
  let skippedCount = 0;

  for (const account of body.accounts) {
    // 确保来源存在
    let source = await db.query.sources.findFirst({
      where: eq(schema.sources.fakeid, account.fakeid),
    });

    if (!source) {
      const [inserted] = await db.insert(schema.sources).values({
        fakeid: account.fakeid,
        name: account.nickname,
        alias: account.alias || null,
        type: 'wechat',
      }).returning();
      source = inserted;
    }

    // 导入文章
    for (const article of account.articles) {
      try {
        await db.insert(schema.articles).values({
          title: article.title,
          link: article.link,
          cover: article.cover || null,
          digest: article.digest || null,
          authorName: article.author_name || null,
          sourceId: source.id,
          sourceType: 'wechat',
          externalId: article.aid || null,
          publishedAt: new Date(article.create_time * 1000),
          content: article.content || null,
        }).onConflictDoNothing({ target: schema.articles.link });
        importedCount++;
      } catch (e: any) {
        if (e.code === '23505') {
          // 唯一约束冲突，文章已存在
          skippedCount++;
        } else {
          throw e;
        }
      }
    }
  }

  return {
    success: true,
    imported: importedCount,
    skipped: skippedCount,
    total: body.total_articles,
  };
});
