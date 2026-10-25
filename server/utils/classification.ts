import {standardTopics,canonicalTopic,domainPrompt} from '../../intelligence/industry-topics.mjs';
import { chatCompletion } from './embedding';
import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

// ============================================================
// Interfaces
// ============================================================

export interface ClassificationResult {
  articleId: number;
  status: 'accepted' | 'rejected' | 'pending';
  matchedTopic: string | null;
  method: 'keyword' | 'llm';
  /** 命中的关键词详情（仅 keyword 方法） */
  matchedKeywords?: { keyword: string; source: 'title' | 'content' | 'group' }[];
}

// ============================================================
// Valid categories (dynamically loaded from database)
// ============================================================

async function getValidCategories(): Promise<string[]> {
  const db = useDB();
  const rules = await db.select({ topic: schema.filterRules.topic })
    .from(schema.filterRules)
    .where(eq(schema.filterRules.type, 'include'));
  return standardTopics.map(t=>t.id);
}

// ============================================================
// Classify prompt (dynamically built from database rules)
// ============================================================

async function buildClassifyPrompt(): Promise<string> {
 return domainPrompt()+'\nReturn JSON {category: standard domain identifier or null, reason: string}. Only classify direct marine energy facts; respect the scope and exclusions above.';
}

// ============================================================
// matchByKeywords - keyword matching from database rules
// ============================================================

export interface KeywordMatchResult {
  topic: string;
  keywords: { keyword: string; source: 'title' | 'content' | 'group' }[];
}

/**
 * 从数据库加载关键词规则并执行匹配。
 * 返回匹配的主题名和命中的关键词详情。
 */
export async function matchByKeywords(title: string, content: string): Promise<KeywordMatchResult | null> {
  const db = useDB();
  const rules = await db.select()
    .from(schema.filterRules)
    .where(eq(schema.filterRules.type, 'include'));

  const enabledRules = rules
    .filter(r => r.enabled && r.topic)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  const fullText = title + ' ' + content;

  for (const rule of enabledRules) {
    // 先检查 titleKeywords 直接命中
    for (const keyword of (rule.titleKeywords || [])) {
      if (title.includes(keyword)) {
        return { topic: canonicalTopic(rule.topic), keywords: [{ keyword, source: 'title' }] };
      }
    }

    // 检查 contentKeywords 直接命中
    for (const keyword of (rule.contentKeywords || [])) {
      if (content.includes(keyword)) {
        return { topic: canonicalTopic(rule.topic), keywords: [{ keyword, source: 'content' }] };
      }
    }

    // 检查 requireAll 组合匹配
    if (rule.requireAll && rule.groups && rule.groups.length > 0) {
      const allGroupsMatched = rule.groups.every(group =>
        group.some(keyword => fullText.includes(keyword)),
      );
      if (allGroupsMatched) {
        const hitKeywords: { keyword: string; source: 'title' | 'content' | 'group' }[] = [];
        for (const group of rule.groups) {
          const hit = group.find(kw => fullText.includes(kw));
          if (hit) hitKeywords.push({ keyword: hit, source: 'group' });
        }
        return { topic: canonicalTopic(rule.topic), keywords: hitKeywords };
      }
    }
  }

  return null;
}

// ============================================================
// classifyByLLM - LLM-based semantic classification
// ============================================================

/**
 * 调用 LLM 进行语义分类。
 * 发送文章标题 + 正文前 2000 字给 LLM，解析返回的 JSON 分类结果。
 *
 * 返回匹配的行业类别名称，如果 LLM 判定不属于任何行业则返回 null。
 * 如果 LLM 返回的类别不在有效列表中，也返回 null。
 * 如果 API 调用失败，抛出错误由调用方处理。
 */
export async function classifyByLLM(title: string, content: string): Promise<string | null> {
  const systemPrompt = await buildClassifyPrompt();
  const validCategories = await getValidCategories();

  const truncatedContent = content.slice(0, 2000);
  const userMessage = `文章标题：${title}\n\n文章内容：\n${truncatedContent}`;

  const response = await chatCompletion(systemPrompt+'\n'+domainPrompt(), userMessage, { task: 'classification' });

  // Parse the LLM response as JSON
  try {
    // Try to extract JSON from the response (LLM may wrap it in markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { category?: string | null; reason?: string };

    // If category is null or not provided, article doesn't belong to any category
    if (!parsed.category) {
      return null;
    }

    // Validate that the category is in the valid list
    if (validCategories.includes(canonicalTopic(parsed.category))) {
      return canonicalTopic(parsed.category);
    }

    // Category not in valid list, treat as null
    return null;
  } catch {
    // JSON parsing failed, treat as invalid response
    return null;
  }
}



// ============================================================
// classifyArticle - orchestrating two-tier classification
// ============================================================

/**
 * 对单篇文章执行两级分类策略：
 * 1. 先调用 matchByKeywords 进行关键词快速匹配
 * 2. 未命中时调用 classifyByLLM 进行 LLM 语义分类
 *
 * 返回 ClassificationResult，包含分类状态和匹配的行业主题。
 */
export async function classifyArticle(article: { id: number; title: string; content: string }): Promise<ClassificationResult> {
  // Step 1: Try keyword matching first (fast, no API call)
  const keywordMatch = await matchByKeywords(article.title, article.content);

  if (keywordMatch) {
    return {
      articleId: article.id,
      status: 'accepted',
      matchedTopic: keywordMatch.topic,
      method: 'keyword',
      matchedKeywords: keywordMatch.keywords,
    };
  }

  // Step 2: Keyword match returned null, fall back to LLM classification
  try {
    const llmCategory = await classifyByLLM(article.title, article.content);

    if (llmCategory) {
      return {
        articleId: article.id,
        status: 'accepted',
        matchedTopic: llmCategory,
        method: 'llm',
      };
    }

    // LLM returned null - article doesn't belong to any category
    return {
      articleId: article.id,
      status: 'rejected',
      matchedTopic: null,
      method: 'llm',
    };
  } catch (error) {
    // LLM call threw an error - log and keep pending
    console.error('[classifyArticle] LLM classification failed for article', article.id, error);
    return {
      articleId: article.id,
      status: 'pending',
      matchedTopic: null,
      method: 'llm',
    };
  }
}
