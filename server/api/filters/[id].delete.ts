import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const db = useDB();
  const [rule] = await db.select().from(schema.filterRules).where(eq(schema.filterRules.id,id));
  if(rule?.type==='context')throw createError({statusCode:400,message:'通用海洋语境配置不能删除；可编辑、清空词表或停用，避免意外恢复历史默认词表。'});

  await db.delete(schema.filterRules).where(eq(schema.filterRules.id, id));
  return { success: true };
});
