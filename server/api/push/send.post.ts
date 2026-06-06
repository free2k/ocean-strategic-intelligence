import { desc, eq, and, gte, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { sendMail } from '~/server/utils/mailer';
import { buildDocxBuffer, formatDate } from '~/server/utils/docx-builder';

function parseDateRange(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '3d': return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '1w': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '2w': return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    default: return null;
  }
}

/**
 * 手动触发推送（生成 Word 文档作为邮件附件发送）
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    taskId?: number;
    email?: string;
    dateRange?: string;
    topics?: string[];
  }>(event);

  const db = useDB();

  let targetEmail: string;
  let dateRange: string;
  let topics: string[];
  let taskId: number | undefined;

  if (body?.taskId) {
    const [task] = await db.select().from(schema.pushTasks).where(eq(schema.pushTasks.id, body.taskId));
    if (!task) throw createError({ statusCode: 404, message: '推送任务不存在' });
    targetEmail = task.email;
    dateRange = task.dateRange;
    topics = (task.topics || []).filter(Boolean);
    taskId = task.id;
  } else if (body?.email) {
    targetEmail = body.email;
    dateRange = body.dateRange || '2w';
    topics = (body.topics || []).filter(Boolean);
  } else {
    throw createError({ statusCode: 400, message: '请提供 taskId 或 email' });
  }

  // 构建查询条件
  const conditions = [];
  conditions.push(eq(schema.articles.filterStatus, 'accepted'));
  const since = parseDateRange(dateRange);
  if (since) conditions.push(gte(schema.articles.publishedAt, since));
  if (topics.length > 0) {
    conditions.push(inArray(schema.articles.matchedTopic, topics));
  }

  const articles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    link: schema.articles.link,
    digest: schema.articles.digest,
    content: schema.articles.content,
    matchedTopic: schema.articles.matchedTopic,
    publishedAt: schema.articles.publishedAt,
    summary: schema.articles.summary,
    sourceName: schema.sources.name,
    isOverseas: schema.sources.isOverseas,
  })
    .from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(and(...conditions))
    .orderBy(desc(schema.articles.publishedAt))
    .limit(100);

  // 过滤掉没有正文内容的文章（未下载或下载失败的）
  const validArticles = articles.filter(a => a.content || a.digest || a.summary);

  if (!validArticles.length) {
    if (taskId) {
      await db.update(schema.pushTasks).set({
        lastStatus: 'failed',
        lastError: '没有符合条件的文章',
        updatedAt: new Date(),
      }).where(eq(schema.pushTasks.id, taskId));
    }
    throw createError({ statusCode: 400, message: '没有符合条件的文章可推送' });
  }

  // 生成 Word 文档
  const { buffer, filename, startDate, endDate } = await buildDocxBuffer(validArticles);

  // 发送邮件（Word 附件 + 简要正文）
  const subject = `【海洋能源资讯】${startDate}-${endDate} 行业动态推送`;
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;">
      <h2 style="color:#1a5276;">海洋能源资讯推送</h2>
      <p style="line-height:1.8;color:#333;">
        本期资讯共收录 <strong>${validArticles.length}</strong> 篇文章，时间范围 ${startDate} 至 ${endDate}。
      </p>
      <p style="line-height:1.8;color:#333;">
        详细内容请查看附件中的 Word 文档，文档包含每篇文章的摘要总结，按行业分类分组编排。
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="color:#999;font-size:12px;">此邮件由「海洋能源资源情报分析系统」自动推送</p>
    </div>
  `;

  try {
    await sendMail({
      to: targetEmail,
      subject,
      html,
      attachments: [{
        filename,
        content: buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }],
    });

    if (taskId) {
      await db.update(schema.pushTasks).set({
        lastSentAt: new Date(),
        lastStatus: 'success',
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(schema.pushTasks.id, taskId));
    }

    return {
      success: true,
      message: `邮件已发送至 ${targetEmail}（${validArticles.length}篇文章，含Word附件）`,
      articleCount: validArticles.length,
    };
  } catch (e: any) {
    if (taskId) {
      await db.update(schema.pushTasks).set({
        lastStatus: 'failed',
        lastError: e.message || '发送失败',
        updatedAt: new Date(),
      }).where(eq(schema.pushTasks.id, taskId));
    }
    throw createError({ statusCode: 500, message: `邮件发送失败: ${e.message}` });
  }
});
