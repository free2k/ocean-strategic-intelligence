import { eq, or, and, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { chatCompletion } from '~/server/utils/embedding';
import { autoDownloadMissingContent } from '~/server/utils/auto-download';

async function classifyByLLMWithRules(title: string, content: string, topics: string[]): Promise<string | null> {
  const topicList = topics.map(t => `- ${t}`).join('\n');
  const systemPrompt = `你是一个行业分类助手。根据以下行业类别，判断给定文章属于哪个行业类别。\n\n可选的行业类别：\n${topicList}\n\n规则：\n- 根据文章标题和内容判断最匹配的行业类别\n- 如果文章不属于以上任何类别，返回 null\n- 以 JSON 格式返回：{"category": "行业类别名"} 或 {"category": null}\n- 只返回 JSON，不要其他文字`;
  const truncatedContent = (content || '').slice(0, 2000);
  try {
    const response = await chatCompletion(systemPrompt, `文章标题：${title}\n\n文章内容：\n${truncatedContent}`);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { category?: string | null };
    if (!parsed.category || !topics.includes(parsed.category)) return null;
    return parsed.category;
  } catch { return null; }
}

/**
 * POST /api/filters/apply-stream
 * SSE 版本的分类应用，支持实时进度展示
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ reapplyAll?: boolean }>(event).catch(() => ({}));
  const db = useDB();

  const res = event.node.res;
  setResponseHeaders(event, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

  const sendEvent = (data: any) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

  // 重置
  if (body?.reapplyAll) {
    sendEvent({ type: 'phase', phase: 'reset', message: '重置文章分类状态（跳过人工标注）...' });
    await db.update(schema.articles)
      .set({ filterStatus: 'pending', matchedTopic: null, rejectReason: null, classifyMethod: null, matchedKeywordsJson: null, updatedAt: new Date() })
      .where(and(
        or(eq(schema.articles.filterStatus, 'accepted'), eq(schema.articles.filterStatus, 'rejected')),
        eq(schema.articles.manualClassify, false),
      ));
  }

  // 加载规则
  const rules = await db.select().from(schema.filterRules).where(eq(schema.filterRules.enabled, true));
  const excludeRules = rules.filter(r => r.type === 'exclude');
  const includeRules = rules.filter(r => r.type === 'include').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  if (!rules.length) {
    sendEvent({ type: 'done', accepted: 0, rejected: 0, pending: 0, total: 0, message: '没有启用的过滤规则' });
    res.end(); return;
  }

  // 待筛选文章（不加载 content 避免内存溢出）
  const pendingArticles = await db.select({
    id: schema.articles.id, title: schema.articles.title, digest: schema.articles.digest, sourceId: schema.articles.sourceId,
  }).from(schema.articles).where(eq(schema.articles.filterStatus, 'pending'));

  if (!pendingArticles.length) {
    sendEvent({ type: 'done', accepted: 0, rejected: 0, pending: 0, total: 0, message: '没有待筛选的文章' });
    res.end(); return;
  }

  sendEvent({ type: 'phase', phase: 'download', message: `检查正文...`, total: pendingArticles.length });

  // 检查哪些文章需要下载正文（通过 download_status 判断，不加载 content 字段）
  const needDownloadArticles = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(and(eq(schema.articles.filterStatus, 'pending'), eq(schema.articles.downloadStatus, 'pending')));

  if (needDownloadArticles.length > 0) {
    const missingContentIds = needDownloadArticles.map(a => a.id);
    sendEvent({ type: 'phase', phase: 'download', message: `正在下载 ${missingContentIds.length} 篇缺失正文...`, total: missingContentIds.length });
    const { downloaded } = await autoDownloadMissingContent(missingContentIds);
    sendEvent({ type: 'phase', phase: 'download', message: `下载完成: 成功 ${downloaded.length} 篇`, total: missingContentIds.length });
  }

  // 分类（分批加载 content 避免内存溢出）
  sendEvent({ type: 'phase', phase: 'classify', message: '开始分类...', total: pendingArticles.length });

  const overseasSources = await db.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.isOverseas, true));
  const overseasSourceIds = new Set(overseasSources.map(s => s.id));
  const validTopics = includeRules.map(r => r.topic).filter((t): t is string => !!t);

  let accepted = 0, rejected = 0;
  const BATCH_SIZE = 50;

  for (let batchStart = 0; batchStart < pendingArticles.length; batchStart += BATCH_SIZE) {
    const batchMeta = pendingArticles.slice(batchStart, batchStart + BATCH_SIZE);
    const batchIds = batchMeta.map(a => a.id);

    // 按批加载 content
    const batchContent = await db.select({ id: schema.articles.id, content: schema.articles.content })
      .from(schema.articles).where(inArray(schema.articles.id, batchIds));
    const contentMap = new Map(batchContent.map(r => [r.id, r.content]));

    for (let j = 0; j < batchMeta.length; j++) {
      const i = batchStart + j;
      const article = batchMeta[j];
      const articleContent = contentMap.get(article.id) || null;
      const titleText = article.title || '';
      const hasContent = !!articleContent;
      // 去除 HTML 标签和 base64 图片数据，只匹配可见文字内容
      const rawContent = articleContent || article.digest || '';
      const contentText = rawContent
        .replace(/data:[^"'\s]+/g, '') // 去除 data URI (base64 图片等)
        .replace(/<[^>]+>/g, ' ')      // 去除 HTML 标签
        .replace(/\s+/g, ' ');
      const isOverseasArticle = article.sourceId ? overseasSourceIds.has(article.sourceId) : false;

      // 排除规则
      let isRejected = false, rejectReason = '';
      for (const rule of excludeRules) {
        const hitTitleKw = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
        const hitContentKw = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
        if (hitTitleKw || hitContentKw) {
          isRejected = true;
          const hitSource = hitTitleKw ? '标题' : (hasContent ? '正文' : '摘要');
          rejectReason = `${hitSource}命中排除词「${hitTitleKw || hitContentKw}」`;
          break;
        }
      }
      if (isRejected) {
        await db.update(schema.articles).set({ filterStatus: 'rejected', rejectReason, updatedAt: new Date() }).where(eq(schema.articles.id, article.id));
        rejected++;
        sendEvent({ type: 'progress', current: i + 1, total: pendingArticles.length, accepted, rejected });
        continue;
      }

      // 正向规则
      let matchedTopic: string | null = null, matchedKeywordsJson: string | null = null;
      for (const rule of includeRules) {
        const titleKw = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
        if (titleKw) { matchedTopic = rule.topic; matchedKeywordsJson = JSON.stringify([{ keyword: titleKw, source: 'title' }]); break; }
        const contentKw = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
        if (contentKw) { matchedTopic = rule.topic; matchedKeywordsJson = JSON.stringify([{ keyword: contentKw, source: hasContent ? 'content' : 'digest' }]); break; }
        if (rule.requireAll && rule.groups && (rule.groups as string[][]).length > 0) {
          const fullText = titleText + ' ' + contentText;
          const allGroupsMatched = (rule.groups as string[][]).every(g => g.some(kw => fullText.includes(kw)));
          if (allGroupsMatched) {
            matchedTopic = rule.topic;
            matchedKeywordsJson = JSON.stringify((rule.groups as string[][]).map(g => ({ keyword: g.find(k => fullText.includes(k))!, source: 'group' })));
            break;
          }
        }
      }
      if (matchedTopic) {
        await db.update(schema.articles).set({ filterStatus: 'accepted', matchedTopic, classifyMethod: 'keyword', matchedKeywordsJson, updatedAt: new Date() }).where(eq(schema.articles.id, article.id));
        accepted++;
        sendEvent({ type: 'progress', current: i + 1, total: pendingArticles.length, accepted, rejected });
        continue;
      }

      // LLM 分类（外网文章）
      if (isOverseasArticle && validTopics.length > 0) {
        const llmTopic = await classifyByLLMWithRules(titleText, contentText, validTopics);
        if (llmTopic) {
          await db.update(schema.articles).set({ filterStatus: 'accepted', matchedTopic: llmTopic, classifyMethod: 'llm', updatedAt: new Date() }).where(eq(schema.articles.id, article.id));
          accepted++;
        }
      }
      sendEvent({ type: 'progress', current: i + 1, total: pendingArticles.length, accepted, rejected });
    }
  }

  // 级联清理 rejected 文章的向量数据
  const rejectedArticles = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.filterStatus, 'rejected'));
  if (rejectedArticles.length > 0) {
    const rejectedIds = rejectedArticles.map(a => a.id);
    await db.delete(schema.articleChunks).where(inArray(schema.articleChunks.articleId, rejectedIds));
    await db.update(schema.articles).set({ vectorized: false, updatedAt: new Date() }).where(inArray(schema.articles.id, rejectedIds));
    console.log(`[Classify] 已清除 ${rejectedArticles.length} 篇 rejected 文章的向量数据`);
  }

  sendEvent({ type: 'done', accepted, rejected, pending: pendingArticles.length - accepted - rejected, total: pendingArticles.length });
  res.end();
});
