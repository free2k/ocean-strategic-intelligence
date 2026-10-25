import {domainPrompt,canonicalTopic} from '../../../intelligence/industry-topics.mjs';
import { eq, or, and, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { chatCompletion } from '~/server/utils/embedding';
import { autoDownloadMissingContent } from '~/server/utils/auto-download';

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
    const response = await chatCompletion(systemPrompt+'\n'+domainPrompt(), userMessage, { task: 'classification' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { category?: string | null };
    if (!parsed.category) return null;
    // 验证返回的类别在有效列表中
    const category=canonicalTopic(parsed.category);if(topics.some(t=>canonicalTopic(t)===category))return category;
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

  // 如果 reapplyAll，先重置所有已分类文章为 pending（跳过人工标注）
  if (body?.reapplyAll) {
    await db.update(schema.articles)
      .set({ filterStatus: 'pending', matchedTopic: null, rejectReason: null, classifyMethod: null, updatedAt: new Date() })
      .where(and(
        or(
          eq(schema.articles.filterStatus, 'accepted'),
          eq(schema.articles.filterStatus, 'rejected'),
        ),
        eq(schema.articles.manualClassify, false),
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
    content: schema.articles.content,
    sourceId: schema.articles.sourceId,
  }).from(schema.articles).where(eq(schema.articles.filterStatus, 'pending'));

  if (!pendingArticles.length) {
    return { success: true, accepted: 0, rejected: 0, pending: 0, message: '没有待筛选的文章' };
  }

  // 自动下载缺失正文的文章（分类前确保有内容可匹配）
  const missingContentIds = pendingArticles.filter(a => !a.content).map(a => a.id);
  if (missingContentIds.length > 0) {
    console.log(`[Classify] 发现 ${missingContentIds.length} 篇缺正文，自动下载中...`);
    const { downloaded, failed } = await autoDownloadMissingContent(missingContentIds);
    console.log(`[Classify] 自动下载完成: 成功=${downloaded.length}, 失败=${failed.length}`);

    // 重新加载已下载的文章内容
    if (downloaded.length > 0) {
      const updatedRows = await db.select({ id: schema.articles.id, content: schema.articles.content })
        .from(schema.articles).where(inArray(schema.articles.id, downloaded));
      const contentMap = new Map(updatedRows.map(r => [r.id, r.content]));
      for (const article of pendingArticles) {
        const newContent = contentMap.get(article.id);
        if (newContent && !article.content) {
          (article as any).content = newContent;
        }
      }
    }
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
    const hasContent = !!article.content;
    // 去除非正文区域（script/style/注释）和 HTML 标签，只匹配可见文字内容
    const rawContentText = article.content || '';
    const contentText = rawContentText
      .replace(/<script[\s\S]*?<\/script>/gi, '') // 去除 script 标签及内容
      .replace(/<style[\s\S]*?<\/style>/gi, '')   // 去除 style 标签及内容
      .replace(/<!--[\s\S]*?-->/g, '')            // 去除 HTML 注释
      .replace(/<head[\s\S]*?<\/head>/gi, '')     // 去除 head 区域（meta 等）
      .replace(/data:[^"'\s]+/g, '')              // 去除 data URI (base64 图片等)
      .replace(/<[^>]+>/g, ' ')                   // 去除 HTML 标签
      .replace(/\s+/g, ' ');
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
        const hitSource = hitTitleKw ? '标题' : (hasContent ? '正文' : '摘要');
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
    let matchedKeywordsJson: string | null = null;
    for (const rule of includeRules) {
      // 先检查 includeTitle 直接命中
      const titleKw = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
      if (titleKw) {
        matchedTopic = rule.topic;
        matchedKeywordsJson = JSON.stringify([{ keyword: titleKw, source: 'title' }]);
        break;
      }

      // 检查 includeContent 直接命中
      const contentKw = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
      if (contentKw) {
        matchedTopic = rule.topic;
        matchedKeywordsJson = JSON.stringify([{ keyword: contentKw, source: 'content' }]);
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
          const hits = (rule.groups as string[][]).map(group => {
            const kw = group.find(k => fullText.includes(k))!;
            return { keyword: kw, source: 'group' };
          });
          matchedKeywordsJson = JSON.stringify(hits);
          break;
        }
      }
    }

    if (matchedTopic) {
      await db.update(schema.articles)
        .set({ filterStatus: 'accepted', matchedTopic, classifyMethod: 'keyword', matchedKeywordsJson, updatedAt: new Date() })
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

  // 级联清理：删除被 rejected 文章的向量数据
  const rejectedArticles = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.filterStatus, 'rejected'));

  if (rejectedArticles.length > 0) {
    const rejectedIds = rejectedArticles.map(a => a.id);
    const deletedChunks = await db.delete(schema.articleChunks)
      .where(inArray(schema.articleChunks.articleId, rejectedIds));
    await db.update(schema.articles)
      .set({ vectorized: false, updatedAt: new Date() })
      .where(inArray(schema.articles.id, rejectedIds));
    console.log(`[Classify] 已清除 ${rejectedArticles.length} 篇 rejected 文章的向量数据`);
  }

  return {
    success: true,
    accepted,
    rejected,
    pending: pendingArticles.length - accepted - rejected,
    total: pendingArticles.length,
  };
});
