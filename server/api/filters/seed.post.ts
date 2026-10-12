import {canonicalTopic,topicDefinition} from '../../../intelligence/industry-topics.mjs';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useDB, schema } from '~/server/db';

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

/**
 * POST /api/filters/seed
 * 从 filter/target.json 导入分类规则到数据库。
 * 会清除现有的正向规则（include），然后重新插入。
 * 反向规则（exclude）不受影响。
 */
export default defineEventHandler(async () => {
  const db = useDB();

  // 读取 target.json
  const targetPath = resolve(process.cwd(), 'filter/target.json');
  const raw = readFileSync(targetPath, 'utf-8');
  const config: TargetConfig = JSON.parse(raw);

  if(Object.keys(config.topics).some(t=>!topicDefinition(t)))throw createError({statusCode:400,message:'导入规则包含未知领域'});
  // 删除现有的正向规则
  await db.delete(schema.filterRules).where(eq(schema.filterRules.type, 'include'));

  // 插入新规则
  const rules = Object.entries(config.topics).map(([topicName, rule]) => ({
    type: 'include' as const,
    topic: canonicalTopic(topicName),
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
  }

  return {
    success: true,
    imported: rules.length,
    topics: rules.map(r => r.topic),
  };
});
