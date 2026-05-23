import { eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { classifyArticle } from '~/server/utils/classification';

export default defineEventHandler(async () => {
  const db = useDB();

  // Query all pending articles with content
  const pendingArticles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    content: schema.articles.content,
  })
    .from(schema.articles)
    .where(and(
      eq(schema.articles.filterStatus, 'pending'),
      isNotNull(schema.articles.content),
    ));

  let accepted = 0;
  let rejected = 0;
  let pending = 0;

  for (const article of pendingArticles) {
    const result = await classifyArticle({
      id: article.id,
      title: article.title,
      content: article.content!,
    });

    await db.update(schema.articles)
      .set({
        filterStatus: result.status,
        matchedTopic: result.matchedTopic,
        classifyMethod: result.method,
      })
      .where(eq(schema.articles.id, article.id));

    if (result.status === 'accepted') accepted++;
    else if (result.status === 'rejected') rejected++;
    else pending++;
  }

  return {
    success: true,
    accepted,
    rejected,
    pending,
    total: pendingArticles.length,
  };
});
