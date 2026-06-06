import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const stepSchema = z.object({
  action: z.enum(['goto', 'click', 'waitForSelector', 'wait', 'type', 'select', 'download', 'slideCaptcha']),
  selector: z.string().optional(),
  value: z.string().optional(),
  timeout: z.number().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  tableSelector: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  steps: z.array(stepSchema).optional(),
  schedule: z.string().nullable().optional(),
  authConfig: z.object({
    type: z.enum(['cookie', 'login']),
    cookieFile: z.string().optional(),
    loginSteps: z.array(stepSchema).optional(),
  }).nullable().optional(),
  enabled: z.boolean().optional(),
});

/** 更新抓取数据源 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) throw createError({ statusCode: 400, message: '无效的 ID' });

  const body = await readBody(event);
  const parsed = bodySchema.parse(body);

  const db = useDB();
  const [updated] = await db
    .update(schema.scrapeSources)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(schema.scrapeSources.id, id))
    .returning();

  if (!updated) throw createError({ statusCode: 404, message: '数据源不存在' });
  return updated;
});
