import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * 对所有 pending 状态的文章应用过滤规则
 * 逻辑：
 * 1. 先检查反向规则（排除），命中则标记 rejected
 * 2. 再检查正向规则（目标行业），命中则标记 accepted 并记录匹配主题
 * 3. 两者都未命中的保持 pending
 */
export default defineEventHandler(async () => {
  const db = useDB();

  // 获取所有启用的规则
  const rules = await db.select().from(schema.filterRules).where(eq(schema.filterRules.enabled, true));
  const excludeRules = rules.filter(r => r.type === 'exclude');
  const includeRules = rules.filter(r => r.type === 'include');

  if (!rules.length) {
    return { success: false, message: '没有启用的过滤规则' };
  }

  // 获取待筛选的文章
  const pendingArticles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    digest: schema.articles.digest,
    content: schema.articles.content,
  }).from(schema.articles).where(eq(schema.articles.filterStatus, 'pending'));

  if (!pendingArticles.length) {
    return { success: true, accepted: 0, rejected: 0, pending: 0, message: '没有待筛选的文章' };
  }

  let accepted = 0;
  let rejected = 0;

  for (const article of pendingArticles) {
    const titleText = article.title || '';
    const contentText = article.content || article.digest || '';

    // 1. 检查反向规则（排除）
    let isRejected = false;
    for (const rule of excludeRules) {
      const titleHit = (rule.titleKeywords as string[]).some(kw => titleText.includes(kw));
      const contentHit = (rule.contentKeywords as string[]).some(kw => contentText.includes(kw));
      if (titleHit || contentHit) {
        isRejected = true;
        break;
      }
    }

    if (isRejected) {
      await db.update(schema.articles)
        .set({ filterStatus: 'rejected', updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));
      rejected++;
      continue;
    }

    // 2. 检查正向规则（目标行业）
    let matchedTopic: string | null = null;
    for (const rule of includeRules) {
      const titleHit = (rule.titleKeywords as string[]).some(kw => titleText.includes(kw));
      const contentHit = (rule.contentKeywords as string[]).some(kw => contentText.includes(kw));
      if (titleHit || contentHit) {
        matchedTopic = rule.topic;
        break;
      }
    }

    if (matchedTopic) {
      await db.update(schema.articles)
        .set({ filterStatus: 'accepted', matchedTopic, updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));
      accepted++;
    }
  }

  return {
    success: true,
    accepted,
    rejected,
    pending: pendingArticles.length - accepted - rejected,
    total: pendingArticles.length,
  };
});
