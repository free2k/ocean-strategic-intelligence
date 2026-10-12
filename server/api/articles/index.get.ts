import {topicAliases} from '../../../intelligence/industry-topics.mjs';
import { desc, eq, like, sql, and, gte, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { classificationEvidence } from '../../integrations/classification-evidence.mjs';

import {dateRangeStart as parseDateRange} from '../../../intelligence/article-scope.mjs';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
  const search = (query.search as string) || '';
  const sourceId = query.sourceId ? Number(query.sourceId) : undefined;
  const sourceType = (query.sourceType as string) || '';
  const filterStatus = (query.filterStatus as string) || '';
  const matchedTopic = (query.matchedTopic as string) || '';
  const dateRange = (query.dateRange as string) || '';
  const overseas = (query.overseas as string) || '';  // 'true' = only overseas, 'false' = exclude overseas

  const db = useDB();
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (search) {
    conditions.push(like(schema.articles.title, `%${search}%`));
  }
  if (sourceId) {
    conditions.push(eq(schema.articles.sourceId, sourceId));
  }
  if (sourceType) {
    conditions.push(eq(schema.articles.sourceType, sourceType));
  }
  if (filterStatus) {
    if (filterStatus === 'manual') {
      conditions.push(eq(schema.articles.manualClassify, true));
    } else {
      conditions.push(eq(schema.articles.filterStatus, filterStatus));
    }
  }
  if (matchedTopic) {
    if (matchedTopic === '外网资讯') {
      // 筛选来自外网来源的文章
      const overseasSourceIds = await db.select({ id: schema.sources.id })
        .from(schema.sources)
        .where(eq(schema.sources.isOverseas, true));
      const ids = overseasSourceIds.map(s => s.id);
      if (ids.length > 0) {
        conditions.push(inArray(schema.articles.sourceId, ids));
      } else {
        // 没有外网来源，返回空结果
        conditions.push(sql`1 = 0`);
      }
    } else {
      conditions.push(inArray(schema.articles.matchedTopic, topicAliases(matchedTopic)));
    }
  }
  if (dateRange) {
    const since = parseDateRange(dateRange);
    if (since) {
      conditions.push(gte(schema.articles.publishedAt, since));
    }
  }

  // Filter by overseas status
  if (overseas === 'true' || overseas === 'false') {
    const overseasSourceIds = await db.select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.isOverseas, overseas === 'true'));
    const ids = overseasSourceIds.map(s => s.id);
    if (ids.length > 0) {
      conditions.push(inArray(schema.articles.sourceId, ids));
    } else {
      conditions.push(sql`1 = 0`);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [articles, countResult] = await Promise.all([
    db.select({
      id: schema.articles.id,
      title: schema.articles.title,
      link: schema.articles.link,
      cover: schema.articles.cover,
      digest: schema.articles.digest,
      authorName: schema.articles.authorName,
      sourceType: schema.articles.sourceType,
      publishedAt: schema.articles.publishedAt,
      createdAt: schema.articles.createdAt,
      vectorized: schema.articles.vectorized,
      filterStatus: schema.articles.filterStatus,
      matchedTopic: schema.articles.matchedTopic,
      rejectReason: schema.articles.rejectReason,
      classifyMethod: schema.articles.classifyMethod,
      manualClassify: schema.articles.manualClassify,
      matchedKeywordsJson: schema.articles.matchedKeywordsJson,
      downloadStatus: schema.articles.downloadStatus,
      sourceName: schema.sources.name,
    })
      .from(schema.articles)
      .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
      .where(where)
      .orderBy(desc(schema.articles.publishedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.articles)
      .where(where),
  ]);

  // Read only compact decision metadata for this page, never historical HTML bodies.
  const articleIds=articles.map(a=>a.id);
  const evidence=new Map<number,any>();const reviews=new Map<number,any>();
  if(articleIds.length){
    const tables=await db.execute(sql`SELECT to_regclass('mp2rss.items') AS mp, to_regclass('classification.articles') AS classified,to_regclass('classification.semantic_queue') AS semantic`);
    const ids=sql.join(articleIds.map(id=>sql`${id}`),sql`, `);
    if(tables.rows[0]?.semantic){const rows=await db.execute(sql`SELECT article_id,status,error FROM classification.semantic_queue WHERE article_id IN (${ids}) AND status IN ('pending','failed','running')`);for(const row of rows.rows)reviews.set(Number(row.article_id),row);}
    if(tables.rows[0]?.mp){const rows=await db.execute(sql`SELECT article_id,classification FROM mp2rss.items WHERE article_id IN (${ids})`);for(const row of rows.rows)evidence.set(Number(row.article_id),[row.classification]);}
    if(tables.rows[0]?.classified){const rows=await db.execute(sql`SELECT article_id,classification FROM classification.articles WHERE article_id IN (${ids})`);for(const row of rows.rows)evidence.set(Number(row.article_id),[...(evidence.get(Number(row.article_id))||[]),row.classification]);}
  }
  return {
    articles:articles.map(a=>({...a,semanticReview:reviews.get(a.id)||null,classificationEvidence:classificationEvidence(a,...(evidence.get(a.id)||[]))})),
    total: Number(countResult[0]?.count || 0),
    page,
    pageSize,
  };
});
