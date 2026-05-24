import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { parseRssXml, type FieldMapping } from '~/server/utils/rss-parser';
import { resolveShortUrl } from '~/server/utils/url-resolver';
import { extractArticleContent } from '~/server/utils/content-extractor';

interface ImportRssBody {
  xmlContent: string;
  fieldMapping: FieldMapping;
  sourceName: string;
}

/**
 * Concurrency limiter: runs async tasks with at most `limit` in parallel.
 * Task 6.1 - Promise pool implementation.
 */
export async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < tasks.length; i++) {
    const index = i;
    const p = tasks[index]().then((result) => {
      results[index] = result;
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Strips HTML tags from a string, returning plain text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Converts a name to a URL-safe slug.
 */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ImportRssBody>(event);

  if (!body?.xmlContent || !body?.sourceName) {
    throw createError({ statusCode: 400, message: '请提供 xmlContent 和 sourceName' });
  }

  const mapping: FieldMapping = body.fieldMapping || {
    title: 'title',
    content: 'content:encoded',
    publishedAt: 'pubDate',
    link: 'link',
    cover: 'enclosure[url]',
  };

  // 1. Parse RSS XML
  const parseResult = parseRssXml(body.xmlContent, mapping);

  if (parseResult.total === 0 && parseResult.errors.length > 0) {
    throw createError({ statusCode: 400, message: parseResult.errors[0].message });
  }

  const db = useDB();

  // 2. Task 6.3 - Upsert source record (type='rss', fakeid=rss_{slug})
  const fakeid = `rss_${slugify(body.sourceName)}`;
  let source = await db.query.sources.findFirst({
    where: eq(schema.sources.fakeid, fakeid),
  });

  if (!source) {
    const [inserted] = await db.insert(schema.sources).values({
      fakeid,
      name: body.sourceName,
      type: 'rss',
    }).returning();
    source = inserted;
  }

  // 3. Task 6.5 - Process items: resolve URLs and fetch content (concurrency limited to 3)
  interface ProcessedItem {
    title: string;
    link: string;
    content: string;
    cover: string | null;
    publishedAt: Date;
    success: boolean;
    error?: string;
  }

  const tasks = parseResult.items.map((item) => async (): Promise<ProcessedItem> => {
    let finalLink = item.link;
    let content = item.content ? stripHtml(item.content) : '';

    try {
      // Resolve short URL if extracted from title
      if (item.extractedUrl) {
        // Always prefer the extracted URL over the RSS <link> (which may be a social media post)
        finalLink = item.extractedUrl;

        const resolved = await resolveShortUrl(item.extractedUrl);
        if (resolved.success) {
          finalLink = resolved.finalUrl;
        }

        // Try to fetch full article content from the resolved/original URL
        const targetUrl = resolved.success ? resolved.finalUrl : item.extractedUrl;
        const extracted = await extractArticleContent(targetUrl);
        if (extracted.success && extracted.content) {
          content = extracted.content;
        }
        // If extraction fails, content remains as the stripped RSS content (fallback)
      }

      return {
        title: item.title,
        link: finalLink,
        content,
        cover: item.cover,
        publishedAt: item.publishedAt,
        success: true,
      };
    } catch (err: any) {
      // Single article failure doesn't block others
      return {
        title: item.title,
        link: finalLink,
        content,
        cover: item.cover,
        publishedAt: item.publishedAt,
        success: false,
        error: err.message,
      };
    }
  });

  const processedItems = await withConcurrency(tasks, 3);

  // 4. Insert articles into database with deduplication
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ title: string; error: string }> = [];

  for (const item of processedItems) {
    if (!item.success) {
      failed++;
      errors.push({ title: item.title, error: item.error || 'Unknown error' });
      continue;
    }

    try {
      const result = await db.insert(schema.articles).values({
        title: item.title,
        link: item.link,
        cover: item.cover || null,
        content: item.content || null,
        sourceId: source.id,
        sourceType: 'rss',
        publishedAt: item.publishedAt,
        filterStatus: 'pending',
      }).onConflictDoNothing({ target: schema.articles.link });

      // Check if insert actually happened
      if (result.rowCount && result.rowCount > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      if (err.code === '23505') {
        // Unique constraint violation - article already exists
        skipped++;
      } else {
        failed++;
        errors.push({ title: item.title, error: err.message });
      }
    }
  }

  return {
    success: true,
    total: parseResult.total,
    imported,
    skipped,
    failed,
    errors,
  };
});
