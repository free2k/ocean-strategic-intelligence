import { eq, or } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface ApplyBody {
  reapplyAll?: boolean;
}

/**
 * 对文章应用过滤规则
 * 
 * Body:
 * - reapplyAll (optional): 如果为 true，先将所有已分类文章重置为 pending，再重新分类
 * 
 * 逻辑：
 * 1. 先检查反向规则（排除），命中则标记 rejected
 * 2. 再检查正向规则（目标行业），命中则标记 accepted 并记录匹配主题
 * 3. 两者都未命中的保持 pending
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<ApplyBody>(event).catch(() => ({}));
  const db = useDB();

  // 如果 reapplyAll，先重置所有已分类文章为 pending
  if (body?.reapplyAll) {
    await db.update(schema.articles)
      .set({ filterStatus: 'pending', matchedTopic: null, rejectReason: null, classifyMethod: null, updatedAt: new Date() })
      .where(or(
        eq(schema.articles.filterStatus, 'accepted'),
        eq(schema.articles.filterStatus, 'rejected'),
      ));
  }

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
    let rejectReason = '';
    for (const rule of excludeRules) {
      const hitTitleKw = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
      const hitContentKw = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
      if (hitTitleKw || hitContentKw) {
        isRejected = true;
        const hitKw = hitTitleKw || hitContentKw;
        const hitSource = hitTitleKw ? '标题' : '正文';
        rejectReason = `${hitSource}命中排除词「${hitKw}」`;
        break;
      }
    }

    if (isRejected) {
      await db.update(schema.articles)
        .set({ filterStatus: 'rejected', rejectReason, updatedAt: new Date() })
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
