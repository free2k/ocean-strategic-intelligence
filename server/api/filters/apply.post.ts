import { eq, or, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { chatCompletion } from '~/server/utils/embedding';

interface ApplyBody {
  reapplyAll?: boolean;
}

/**
 * 使用 LLM 对外网文章进行语义分类
 * 基于用户设置的分类规则（正向规则的 topic 列表）
 */
async function classifyByLLMWithRules(
  title: string,
  content: string,
  topics: string[],
): Promise<string | null> {
  const topicList = topics.map(t => `- ${t}`).join('\n');
  const systemPrompt = `你是一个行业分类助手。根据以下行业类别，判断给定文章属于哪个行业类别。

可选的行业类别：
${topicList}

规则：
- 根据文章标题和内容判断最匹配的行业类别
- 如果文章不属于以上任何类别，返回 null
- 以 JSON 格式返回：{"category": "行业类别名"} 或 {"category": null}
- 只返回 JSON，不要其他文字`;

  const truncatedContent = (content || '').slice(0, 2000);
  const userMessage = `文章标题：${title}\n\n文章内容：\n${truncatedContent}`;

  try {
    const response = await chatCompletion(systemPrompt, userMessage);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { category?: string | null };
    if (!parsed.category) return null;
    // 验证返回的类别在有效列表中
    if (topics.includes(parsed.category)) return parsed.category;
    return null;
  } catch {
    return null;
  }
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
  // 正向规则按 priority 排序（数字越小越优先）
  const includeRules = rules.filter(r => r.type === 'include').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  if (!rules.length) {
    return { success: false, message: '没有启用的过滤规则' };
  }

  // 获取待筛选的文章（含来源信息）
  const pendingArticles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    digest: schema.articles.digest,
    content: schema.articles.content,
    sourceId: schema.articles.sourceId,
  }).from(schema.articles).where(eq(schema.articles.filterStatus, 'pending'));

  if (!pendingArticles.length) {
    return { success: true, accepted: 0, rejected: 0, pending: 0, message: '没有待筛选的文章' };
  }

  // 获取外网来源 ID 列表
  const overseasSources = await db.select({ id: schema.sources.id })
    .from(schema.sources)
    .where(eq(schema.sources.isOverseas, true));
  const overseasSourceIds = new Set(overseasSources.map(s => s.id));

  // 获取正向规则的 topic 列表（用于 LLM 分类）
  const validTopics = includeRules
    .map(r => r.topic)
    .filter((t): t is string => !!t);

  let accepted = 0;
  let rejected = 0;

  for (const article of pendingArticles) {
    const titleText = article.title || '';
    const contentText = article.content || article.digest || '';
    const isOverseasArticle = article.sourceId ? overseasSourceIds.has(article.sourceId) : false;

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

    // 2. 检查正向规则（关键词匹配，按优先级排序）
    let matchedTopic: string | null = null;
    for (const rule of includeRules) {
      // 先检查 includeTitle 直接命中
      const titleHit = (rule.titleKeywords as string[]).some(kw => titleText.includes(kw));
      if (titleHit) {
        matchedTopic = rule.topic;
        break;
      }

      // 检查 includeContent 直接命中
      const contentHit = (rule.contentKeywords as string[]).some(kw => contentText.includes(kw));
      if (contentHit) {
        matchedTopic = rule.topic;
        break;
      }

      // 检查 requireAll 组合匹配
      if (rule.requireAll && rule.groups && (rule.groups as string[][]).length > 0) {
        const fullText = titleText + ' ' + contentText;
        const allGroupsMatched = (rule.groups as string[][]).every(group =>
          group.some(keyword => fullText.includes(keyword)),
        );
        if (allGroupsMatched) {
          matchedTopic = rule.topic;
          break;
        }
      }
    }

    if (matchedTopic) {
      await db.update(schema.articles)
        .set({ filterStatus: 'accepted', matchedTopic, classifyMethod: 'keyword', updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));
      accepted++;
      continue;
    }

    // 3. 外网文章关键词未命中时，使用 LLM 语义分类
    if (isOverseasArticle && validTopics.length > 0) {
      const llmTopic = await classifyByLLMWithRules(titleText, contentText, validTopics);
      if (llmTopic) {
        await db.update(schema.articles)
          .set({ filterStatus: 'accepted', matchedTopic: llmTopic, classifyMethod: 'llm', updatedAt: new Date() })
          .where(eq(schema.articles.id, article.id));
        accepted++;
      }
      // LLM 返回 null 的外网文章保持 pending，不标记 rejected
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
