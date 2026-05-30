import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    url: string;
    name?: string;
    authorization?: string;
    isPublic?: boolean;
  }>(event);

  if (!body?.url) {
    throw createError({ statusCode: 400, message: '代理节点 URL 不能为空' });
  }

  const db = useDB();
  const [proxy] = await db.insert(schema.proxyNodes).values({
    url: body.url,
    name: body.name || null,
    authorization: body.authorization || null,
    isPublic: body.isPublic ?? false,
  }).returning();

  return proxy;
});
