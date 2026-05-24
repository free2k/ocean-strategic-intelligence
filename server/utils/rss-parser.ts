import { XMLParser } from 'fast-xml-parser';

export interface FieldMapping {
  title: string;
  content: string;
  publishedAt: string;
  link: string;
  cover: string;
}

export interface RssItem {
  title: string;
  extractedUrl: string | null;
  content: string;
  publishedAt: Date;
  link: string;
  cover: string | null;
}

export interface ParseResult {
  items: RssItem[];
  total: number;
  successCount: number;
  failedCount: number;
  errors: Array<{ index: number; message: string }>;
}

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  title: 'title',
  content: 'content:encoded',
  publishedAt: 'pubDate',
  link: 'link',
  cover: 'enclosure[url]',
};

/**
 * Separates a title string into clean title text and URL.
 * Matches URLs starting with https:// or http://.
 */
export function extractUrlFromTitle(title: string): { cleanTitle: string; url: string | null } {
  const urlRegex = /https?:\/\/[^\s]+/;
  const match = title.match(urlRegex);

  if (!match) {
    return { cleanTitle: title.trim(), url: null };
  }

  const url = match[0];
  const cleanTitle = title.replace(urlRegex, '').trim();
  return { cleanTitle, url };
}

/**
 * Extracts a value from a parsed XML item using a field path.
 *
 * Supported path formats:
 * - Simple field: "title" → item.title
 * - Namespace field: "content:encoded" → item['content:encoded']
 * - Attribute field: "enclosure[url]" → item.enclosure?.['@_url']
 */
export function getFieldValue(item: Record<string, any>, fieldPath: string): string | null {
  // Attribute field pattern: "element[attribute]"
  const attrMatch = fieldPath.match(/^(.+)\[(.+)\]$/);

  if (attrMatch) {
    const [, element, attribute] = attrMatch;
    const elementValue = item[element];
    if (elementValue == null) return null;

    const attrKey = `@_${attribute}`;
    if (typeof elementValue === 'object' && attrKey in elementValue) {
      return String(elementValue[attrKey]);
    }
    return null;
  }

  // Simple or namespace field: direct property access
  const value = item[fieldPath];
  if (value == null) return null;

  // Handle CDATA or object values
  return extractTextValue(value);
}

/**
 * Extracts text from a value that may be a plain string,
 * or an object with __cdata or #text properties.
 */
function extractTextValue(value: any): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object' && value !== null) {
    if ('__cdata' in value) return String(value.__cdata);
    if ('#text' in value) return String(value['#text']);
  }

  return null;
}

/**
 * Parses RSS XML content and extracts items according to the field mapping.
 */
export function parseRssXml(xmlContent: string, mapping: FieldMapping): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const parsed = parser.parse(xmlContent);

  // Navigate to items
  const channel = parsed?.rss?.channel;
  if (!channel) {
    return {
      items: [],
      total: 0,
      successCount: 0,
      failedCount: 0,
      errors: [{ index: -1, message: 'Invalid RSS XML: missing rss.channel' }],
    };
  }

  let rawItems = channel.item;
  if (!rawItems) {
    return {
      items: [],
      total: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  // Wrap single item in array
  if (!Array.isArray(rawItems)) {
    rawItems = [rawItems];
  }

  const total = rawItems.length;
  const items: RssItem[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < rawItems.length; i++) {
    try {
      const rawItem = rawItems[i];

      const rawTitle = getFieldValue(rawItem, mapping.title) || '';
      const { cleanTitle, url: extractedUrl } = extractUrlFromTitle(rawTitle);

      const content = getFieldValue(rawItem, mapping.content) || '';
      const rawDate = getFieldValue(rawItem, mapping.publishedAt) || '';
      const link = getFieldValue(rawItem, mapping.link) || '';
      const cover = getFieldValue(rawItem, mapping.cover) || null;

      const publishedAt = new Date(rawDate);
      if (isNaN(publishedAt.getTime()) && rawDate !== '') {
        errors.push({ index: i, message: `Invalid date: "${rawDate}"` });
        continue;
      }

      items.push({
        title: cleanTitle,
        extractedUrl,
        content,
        publishedAt: isNaN(publishedAt.getTime()) ? new Date(0) : publishedAt,
        link,
        cover,
      });
    } catch (err: any) {
      errors.push({ index: i, message: err.message || 'Unknown error' });
    }
  }

  return {
    items,
    total,
    successCount: items.length,
    failedCount: total - items.length,
    errors,
  };
}
