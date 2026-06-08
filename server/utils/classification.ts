import { readFileSync } from 'fs';
import { resolve } from 'path';
import { chatCompletion } from './embedding';

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

interface TopicRule {
  description: string;
  priority?: number;
  requireAll?: boolean;
  groups?: string[][];
  includeTitle: string[];
  includeContent: string[];
}

interface TargetConfig {
  topics: Record<string, TopicRule>;
}

// ============================================================
// Valid categories
// ============================================================

const VALID_CATEGORIES = [
  '海洋能源资源宏观政策要闻',
  '海洋油气要闻',
  '海洋新能源要闻',
  '海洋多能融合要闻',
  '海洋低碳领域要闻',
] as const;

// ============================================================
// Keyword rules cache (load once, reuse)
// ============================================================

let _cachedRules: TargetConfig | null = null;

function loadRules(): TargetConfig {
  if (_cachedRules) {
    return _cachedRules;
  }

  const targetPath = resolve(process.cwd(), 'filter/target.json');
  const raw = readFileSync(targetPath, 'utf-8');
  _cachedRules = JSON.parse(raw) as TargetConfig;
  return _cachedRules;
}

// ============================================================
// Classify prompt cache (load once, reuse)
// ============================================================

let _cachedClassifyPrompt: string | null = null;

function loadClassifyPrompt(): string {
  if (_cachedClassifyPrompt) {
    return _cachedClassifyPrompt;
  }

  const classifyPath = resolve(process.cwd(), 'source/template/classify.txt');
  const classifyContent = readFileSync(classifyPath, 'utf-8');

  _cachedClassifyPrompt = `你是一个行业分类助手。根据以下行业类别定义，判断给定文章属于哪个行业类别。

${classifyContent}

请以 JSON 格式返回分类结果：{"category": "行业类别名", "reason": "分类理由"}
如果文章不属于以上任何行业类别，返回：{"category": null, "reason": "不属于任何行业类别"}

有效的行业类别为：
- 海洋能源资源宏观政策要闻
- 海洋油气要闻
- 海洋新能源要闻
- 海洋多能融合要闻
- 海洋低碳领域要闻`;

  return _cachedClassifyPrompt;
}

// ============================================================
// matchByKeywords - synchronous keyword matching
// ============================================================

export interface KeywordMatchResult {
  topic: string;
  keywords: { keyword: string; source: 'title' | 'content' | 'group' }[];
}

/**
 * 从 target.json 加载关键词规则并执行匹配。
 * 返回匹配的主题名和命中的关键词详情。
 */
export function matchByKeywords(title: string, content: string): KeywordMatchResult | null {
  const rules = loadRules();

  const sortedTopics = Object.entries(rules.topics).sort(
    ([, a], [, b]) => (a.priority ?? 99) - (b.priority ?? 99),
  );

  const fullText = title + ' ' + content;

  for (const [topicName, rule] of sortedTopics) {
    // 先检查 includeTitle 直接命中
    for (const keyword of rule.includeTitle) {
      if (title.includes(keyword)) {
        return { topic: topicName, keywords: [{ keyword, source: 'title' }] };
      }
    }

    // 检查 includeContent 直接命中
    for (const keyword of rule.includeContent) {
      if (content.includes(keyword)) {
        return { topic: topicName, keywords: [{ keyword, source: 'content' }] };
      }
    }

    // 检查 requireAll 组合匹配
    if (rule.requireAll && rule.groups && rule.groups.length > 0) {
      const allGroupsMatched = rule.groups.every(group =>
        group.some(keyword => fullText.includes(keyword)),
      );
      if (allGroupsMatched) {
        // 收集每组命中的关键词
        const hitKeywords: { keyword: string; source: 'title' | 'content' | 'group' }[] = [];
        for (const group of rule.groups) {
          const hit = group.find(kw => fullText.includes(kw));
          if (hit) hitKeywords.push({ keyword: hit, source: 'group' });
        }
        return { topic: topicName, keywords: hitKeywords };
      }
    }
  }

  return null;
}

/**
 * 清除缓存的规则（用于测试）
 */
export function _clearRulesCache(): void {
  _cachedRules = null;
}

/**
 * 直接设置规则缓存（用于测试）
 */
export function _setRulesCache(rules: TargetConfig): void {
  _cachedRules = rules;
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
  const systemPrompt = loadClassifyPrompt();

  const truncatedContent = content.slice(0, 2000);
  const userMessage = `文章标题：${title}\n\n文章内容：\n${truncatedContent}`;

  const response = await chatCompletion(systemPrompt, userMessage);

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
    if (VALID_CATEGORIES.includes(parsed.category as typeof VALID_CATEGORIES[number])) {
      return parsed.category;
    }

    // Category not in valid list, treat as null
    return null;
  } catch {
    // JSON parsing failed, treat as invalid response
    return null;
  }
}

/**
 * 清除分类 prompt 缓存（用于测试）
 */
export function _clearClassifyPromptCache(): void {
  _cachedClassifyPrompt = null;
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
  const keywordMatch = matchByKeywords(article.title, article.content);

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
