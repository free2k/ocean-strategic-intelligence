import { useDB, schema } from '~/server/db';

/**
 * 从 JSON 导入过滤规则
 * 支持两种格式：
 * 1. 正向规则（target.json 格式）: { topics: { [name]: { includeTitle, includeContent, description } } }
 * 2. 反向规则（dispose.json 格式）: { excludeTitle: [], excludeContent: [] }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event);
  const db = useDB();
  let importedCount = 0;

  // 正向规则格式
  if (body?.topics) {
    for (const [topic, config] of Object.entries(body.topics) as [string, any][]) {
      await db.insert(schema.filterRules).values({
        type: 'include',
        topic,
        description: config.description || null,
        titleKeywords: config.includeTitle || [],
        contentKeywords: config.includeContent || [],
      });
      importedCount++;
    }
  }

  // 反向规则格式
  if (body?.excludeTitle || body?.excludeContent) {
    await db.insert(schema.filterRules).values({
      type: 'exclude',
      topic: '通用排除规则',
      description: '从 dispose.json 导入的排除规则',
      titleKeywords: body.excludeTitle || [],
      contentKeywords: body.excludeContent || [],
    });
    importedCount++;
  }

  return { success: true, imported: importedCount };
});
