import { pgTable, serial, text, timestamp, integer, boolean, vector, index, varchar, jsonb } from 'drizzle-orm/pg-core';

/** 文章来源/公众号 */
export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  fakeid: varchar('fakeid', { length: 64 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  alias: varchar('alias', { length: 255 }),
  avatar: text('avatar'),
  type: varchar('type', { length: 32 }).notNull().default('wechat'), // wechat | web | rss | manual
  /** 是否为外网来源（导出时归入"外网资讯"分类） */
  isOverseas: boolean('is_overseas').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** 文章表 */
export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  link: text('link').notNull().unique(),
  cover: text('cover'),
  digest: text('digest'),
  content: text('content'),
  authorName: varchar('author_name', { length: 255 }),
  sourceId: integer('source_id').references(() => sources.id),
  sourceType: varchar('source_type', { length: 32 }).notNull().default('wechat'),
  externalId: varchar('external_id', { length: 128 }), // aid 等外部 ID
  publishedAt: timestamp('published_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  vectorized: boolean('vectorized').default(false).notNull(),
  /** 过滤状态: pending=待筛选, accepted=通过, rejected=排除 */
  filterStatus: varchar('filter_status', { length: 16 }).default('pending').notNull(),
  /** 匹配到的行业主题（正向过滤命中时记录） */
  matchedTopic: varchar('matched_topic', { length: 128 }),
  /** 排除原因（反向过滤命中时记录命中的关键词） */
  rejectReason: varchar('reject_reason', { length: 255 }),
  /** 分类方法: keyword=关键词匹配, llm=LLM语义分类 */
  classifyMethod: varchar('classify_method', { length: 16 }),
  /** LLM 生成的摘要文本 */
  summary: text('summary'),
  /** 摘要生成状态: pending | generated | failed */
  summaryStatus: varchar('summary_status', { length: 16 }).default('pending').notNull(),
  /** 下载状态: pending | downloaded | deleted | failed */
  downloadStatus: varchar('download_status', { length: 16 }).default('pending').notNull(),
}, (table) => ({
  sourceIdx: index('articles_source_idx').on(table.sourceId),
  publishedIdx: index('articles_published_idx').on(table.publishedAt),
  filterStatusIdx: index('articles_filter_status_idx').on(table.filterStatus),
}));

/** 文章向量块（将文章拆分为多个 chunk 分别向量化） */
export const articleChunks = pgTable('article_chunks', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').references(() => articles.id).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  articleIdx: index('chunks_article_idx').on(table.articleId),
}));

/** 过滤规则表 */
export const filterRules = pgTable('filter_rules', {
  id: serial('id').primaryKey(),
  /** 规则类型: include=正向(目标行业), exclude=反向(排除) */
  type: varchar('type', { length: 16 }).notNull(),
  /** 行业/主题名称（正向规则必填） */
  topic: varchar('topic', { length: 128 }),
  /** 规则描述 */
  description: text('description'),
  /** 标题关键词列表 */
  titleKeywords: jsonb('title_keywords').$type<string[]>().default([]).notNull(),
  /** 正文关键词列表 */
  contentKeywords: jsonb('content_keywords').$type<string[]>().default([]).notNull(),
  /** 优先级（数字越小越优先，默认 99） */
  priority: integer('priority').default(99).notNull(),
  /** 是否需要组合匹配（所有 groups 都命中才算匹配） */
  requireAll: boolean('require_all').default(false).notNull(),
  /** 组合匹配的关键词分组（每组至少命中一个词） */
  groups: jsonb('groups').$type<string[][]>().default([]).notNull(),
  /** 是否启用 */
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** 代理节点配置表 */
export const proxyNodes = pgTable('proxy_nodes', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  name: varchar('name', { length: 128 }),
  authorization: text('authorization'),
  isPublic: boolean('is_public').default(false).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  failureCount: integer('failure_count').default(0).notNull(),
  successCount: integer('success_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Cookie 实体类型 */
export interface CookieEntity {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
}

/** 微信登录会话表 */
export const wechatSessions = pgTable('wechat_sessions', {
  id: serial('id').primaryKey(),
  authKey: varchar('auth_key', { length: 64 }).notNull().unique(),
  token: varchar('token', { length: 128 }).notNull(),
  cookies: jsonb('cookies').$type<CookieEntity[]>().notNull(),
  nickname: varchar('nickname', { length: 128 }),
  avatar: text('avatar'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

