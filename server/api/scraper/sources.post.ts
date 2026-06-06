import { useDB, schema } from '~/server/db';
import { z } from 'zod';

const stepSchema = z.object({
  action: z.enum(['goto', 'click', 'waitForSelector', 'wait', 'type', 'select', 'download', 'slideCaptcha']),
  selector: z.string().optional(),
  value: z.string().optional(),
  timeout: z.number().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  url: z.string().url('请输入有效的 URL'),
  tableSelector: z.string().min(1, '表格选择器不能为空'),
  channel: z.string().min(1).default('默认'),
  steps: z.array(stepSchema).default([]),
  schedule: z.string().nullable().optional(),
  authConfig: z.object({
    type: z.enum(['cookie', 'login']),
    cookieFile: z.string().optional(),
    loginSteps: z.array(stepSchema).optional(),
  }).nullable().optional(),
  enabled: z.boolean().default(true),
});

/** 创建新的抓取数据源 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const parsed = bodySchema.parse(body);

  const db = useDB();
  const [source] = await db
    .insert(schema.scrapeSources)
    .values({
      name: parsed.name,
      url: parsed.url,
      tableSelector: parsed.tableSelector,
      channel: parsed.channel,
      steps: parsed.steps,
      schedule: parsed.schedule || null,
      authConfig: parsed.authConfig || null,
      enabled: parsed.enabled,
    })
    .returning();

  return source;
});
