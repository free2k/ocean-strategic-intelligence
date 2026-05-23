/**
 * 命令行批量导入脚本
 * 用法: npm run import -- <json文件路径>
 *
 * 直接读取 batch_sync.py 输出的 JSON 文件并导入到数据库
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../server/db/schema';
import 'dotenv/config';

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: npm run import -- <json文件路径>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);
if (!fs.existsSync(absolutePath)) {
  console.error(`文件不存在: ${absolutePath}`);
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`开始导入: ${data.total_articles} 篇文章，来自 ${data.total_accounts} 个公众号`);

  let imported = 0;
  let skipped = 0;

  for (const account of data.accounts) {
    // 确保来源存在
    let source = await db.query.sources.findFirst({
      where: eq(schema.sources.fakeid, account.fakeid),
    });

    if (!source) {
      const [inserted] = await db.insert(schema.sources).values({
        fakeid: account.fakeid,
        name: account.nickname,
        alias: account.alias || null,
        type: 'wechat',
      }).returning();
      source = inserted;
      console.log(`  新增来源: ${account.nickname}`);
    }

    for (const article of account.articles) {
      try {
        await db.insert(schema.articles).values({
          title: article.title,
          link: article.link,
          cover: article.cover || null,
          digest: article.digest || null,
          authorName: article.author_name || null,
          sourceId: source.id,
          sourceType: 'wechat',
          externalId: article.aid || null,
          publishedAt: new Date(article.create_time * 1000),
          content: article.content || null,
        }).onConflictDoNothing({ target: schema.articles.link });
        imported++;
      } catch (e: any) {
        if (e.code === '23505') {
          skipped++;
        } else {
          console.error(`  导入失败: ${article.title}`, e.message);
        }
      }
    }

    console.log(`  ${account.nickname}: ${account.articles.length} 篇`);
  }

  console.log(`\n导入完成: 新增 ${imported} 篇，跳过 ${skipped} 篇`);
  await pool.end();
}

main().catch(console.error);
