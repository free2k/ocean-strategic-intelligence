import { eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { useDB, schema } from '~/server/db';

/**
 * 服务启动时自动检测：如果数据库中没有正向分类规则，
 * 则从 filter/target.json 导入默认规则。
 * 
 * 只在数据库为空时执行一次，后续网页编辑的规则不会被覆盖。
 */
export default defineNitroPlugin(async () => {
  try {
    const db = useDB();

    // 检查是否已有正向规则
    const existing = await db.select({ id: schema.filterRules.id })
      .from(schema.filterRules)
      .where(eq(schema.filterRules.type, 'include'))
      .limit(1);

    if (existing.length > 0) {
      // 已有规则，不覆盖
      return;
    }

    // 读取 target.json
    const targetPath = resolve(process.cwd(), 'filter/target.json');
    if (!existsSync(targetPath)) {
      console.warn('[seed-filter-rules] filter/target.json not found, skipping auto-seed');
      return;
    }

    const raw = readFileSync(targetPath, 'utf-8');
    const config = JSON.parse(raw) as {
      topics: Record<string, {
        description: string;
        priority?: number;
        requireAll?: boolean;
        groups?: string[][];
        includeTitle: string[];
        includeContent: string[];
      }>;
    };

    const rules = Object.entries(config.topics).map(([topicName, rule]) => ({
      type: 'include' as const,
      topic: topicName,
      description: rule.description,
      titleKeywords: rule.includeTitle,
      contentKeywords: rule.includeContent,
      priority: rule.priority ?? 99,
      requireAll: rule.requireAll ?? false,
      groups: rule.groups ?? [],
      enabled: true,
    }));

    if (rules.length > 0) {
      await db.insert(schema.filterRules).values(rules);
      console.log(`[seed-filter-rules] Auto-imported ${rules.length} classification rules from target.json`);
    }
  } catch (error) {
    console.error('[seed-filter-rules] Failed to auto-seed filter rules:', error);
  }
});
