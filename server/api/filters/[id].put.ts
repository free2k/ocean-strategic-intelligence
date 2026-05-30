import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody<{
    topic?: string;
    description?: string;
    titleKeywords?: string[];
    contentKeywords?: string[];
    enabled?: boolean;
    priority?: number;
    requireAll?: boolean;
    groups?: string[][];
  }>(event);

  const db = useDB();
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (body.topic !== undefined) updates.topic = body.topic;
  if (body.description !== undefined) updates.description = body.description;
  if (body.titleKeywords !== undefined) updates.titleKeywords = body.titleKeywords;
  if (body.contentKeywords !== undefined) updates.contentKeywords = body.contentKeywords;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.requireAll !== undefined) updates.requireAll = body.requireAll;
  if (body.groups !== undefined) updates.groups = body.groups;

  const [rule] = await db.update(schema.filterRules)
    .set(updates)
    .where(eq(schema.filterRules.id, id))
    .returning();

  return { success: true, rule };
});
