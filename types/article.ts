/** 文章来源渠道 */
export type ArticleSource = 'wechat' | 'web' | 'rss' | 'manual';

/** 文章导入格式（兼容微信爬取工具的输出） */
export interface ImportArticle {
  aid?: string;
  title: string;
  link: string;
  cover?: string;
  digest?: string;
  author_name?: string;
  create_time: number;
  content?: string;
  // 微信特有字段
  fakeid?: string;
  appmsgid?: number;
  itemidx?: number;
}

/** 批量导入文件格式（兼容 batch_sync.py 输出） */
export interface ImportBatch {
  sync_time: string;
  total_accounts: number;
  total_articles: number;
  accounts: {
    fakeid: string;
    nickname: string;
    alias?: string;
    article_count: number;
    articles: ImportArticle[];
  }[];
}

/** 文章展示格式 */
export interface ArticleView {
  id: number;
  title: string;
  link: string;
  cover?: string | null;
  digest?: string | null;
  authorName?: string | null;
  source: ArticleSource;
  sourceName?: string | null;
  publishedAt: string;
  createdAt: string;
  vectorized: boolean;
}

/** 问答结果 */
export interface QAResult {
  answer: string;
  references: {
    id: number;
    title: string;
    link: string;
    score: number;
    snippet: string;
  }[];
}
