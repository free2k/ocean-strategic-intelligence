import { eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateSummary } from '~/server/utils/summary';

export default defineEventHandler(async () => {
  const db = useDB();

  // Query articles that need summaries
  const articles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    content: schema.articles.content,
    link: schema.articles.link,
    filterStatus: schema.articles.filterStatus,
    matchedTopic: schema.articles.matchedTopic,
  })
    .from(schema.articles)
    .where(and(
      eq(schema.articles.filterStatus, 'accepted'),
      eq(schema.articles.summaryStatus, 'pending'),
      isNotNull(schema.articles.matchedTopic),
      isNotNull(schema.articles.content),
    ));

  let generated = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      const result = await generateSummary({
        id: article.id,
        title: article.title,
        content: article.content!,
        link: article.link,
        filterStatus: article.filterStatus,
        matchedTopic: article.matchedTopic,
      });

      await db.update(schema.articles)
        .set({
          summary: result.summary,
          summaryStatus: 'generated',
        })
        .where(eq(schema.articles.id, article.id));

      generated++;
    } catch (error) {
      console.error(`[summarize] Failed for article ${article.id}:`, error);
      await db.update(schema.articles)
        .set({ summaryStatus: 'failed' })
        .where(eq(schema.articles.id, article.id));
      failed++;
    }
  }

  return {
    success: true,
    generated,
    failed,
    skipped: 0,
    total: articles.length,
  };
});
