import { describe, it, expect } from 'vitest';
import {
  extractUrlFromTitle,
  getFieldValue,
  parseRssXml,
  DEFAULT_FIELD_MAPPING,
} from '../../server/utils/rss-parser';

describe('extractUrlFromTitle', () => {
  it('extracts https URL from title', () => {
    const result = extractUrlFromTitle('Astro Offshore Expands https://ift.tt/5SYnHEP');
    expect(result.cleanTitle).toBe('Astro Offshore Expands');
    expect(result.url).toBe('https://ift.tt/5SYnHEP');
  });

  it('extracts http URL from title', () => {
    const result = extractUrlFromTitle('Some Title http://example.com/page');
    expect(result.cleanTitle).toBe('Some Title');
    expect(result.url).toBe('http://example.com/page');
  });

  it('returns null url when no URL present', () => {
    const result = extractUrlFromTitle('Just a plain title');
    expect(result.cleanTitle).toBe('Just a plain title');
    expect(result.url).toBeNull();
  });

  it('handles URL at the beginning of title', () => {
    const result = extractUrlFromTitle('https://example.com Some Title');
    expect(result.cleanTitle).toBe('Some Title');
    expect(result.url).toBe('https://example.com');
  });

  it('handles title that is only a URL', () => {
    const result = extractUrlFromTitle('https://example.com/article');
    expect(result.cleanTitle).toBe('');
    expect(result.url).toBe('https://example.com/article');
  });

  it('trims whitespace from clean title', () => {
    const result = extractUrlFromTitle('  Title with spaces  https://url.com  ');
    expect(result.cleanTitle).toBe('Title with spaces');
    expect(result.url).toBe('https://url.com');
  });

  it('handles empty string', () => {
    const result = extractUrlFromTitle('');
    expect(result.cleanTitle).toBe('');
    expect(result.url).toBeNull();
  });
});

describe('getFieldValue', () => {
  it('extracts simple field', () => {
    const item = { title: 'Hello World' };
    expect(getFieldValue(item, 'title')).toBe('Hello World');
  });

  it('extracts namespace field', () => {
    const item = { 'content:encoded': '<p>Some content</p>' };
    expect(getFieldValue(item, 'content:encoded')).toBe('<p>Some content</p>');
  });

  it('extracts attribute field', () => {
    const item = { enclosure: { '@_url': 'https://img.com/pic.jpg', '@_type': 'image/jpeg' } };
    expect(getFieldValue(item, 'enclosure[url]')).toBe('https://img.com/pic.jpg');
  });

  it('returns null for missing field', () => {
    const item = { title: 'Hello' };
    expect(getFieldValue(item, 'nonexistent')).toBeNull();
  });

  it('returns null for missing attribute', () => {
    const item = { enclosure: { '@_type': 'image/jpeg' } };
    expect(getFieldValue(item, 'enclosure[url]')).toBeNull();
  });

  it('returns null for missing element in attribute path', () => {
    const item = { title: 'Hello' };
    expect(getFieldValue(item, 'enclosure[url]')).toBeNull();
  });

  it('handles numeric values', () => {
    const item = { count: 42 };
    expect(getFieldValue(item, 'count')).toBe('42');
  });

  it('handles CDATA object values', () => {
    const item = { title: { __cdata: 'CDATA Title' } };
    expect(getFieldValue(item, 'title')).toBe('CDATA Title');
  });

  it('handles #text object values', () => {
    const item = { title: { '#text': 'Text Title' } };
    expect(getFieldValue(item, 'title')).toBe('Text Title');
  });
});

describe('parseRssXml', () => {
  const minimalRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Article One https://ift.tt/abc123</title>
      <link>https://example.com/1</link>
      <content:encoded><![CDATA[<p>Content one</p>]]></content:encoded>
      <pubDate>Fri, 17 Apr 2026 20:01:00 +0800</pubDate>
      <enclosure url="https://img.com/1.jpg" type="image/jpeg"/>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://example.com/2</link>
      <content:encoded><![CDATA[<p>Content two</p>]]></content:encoded>
      <pubDate>Sat, 18 Apr 2026 10:00:00 +0800</pubDate>
    </item>
  </channel>
</rss>`;

  it('parses valid RSS with multiple items', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.total).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.items).toHaveLength(2);
  });

  it('extracts URL from title correctly', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.items[0].title).toBe('Article One');
    expect(result.items[0].extractedUrl).toBe('https://ift.tt/abc123');
  });

  it('handles items without URL in title', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.items[1].title).toBe('Article Two');
    expect(result.items[1].extractedUrl).toBeNull();
  });

  it('extracts content from CDATA', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.items[0].content).toBe('<p>Content one</p>');
  });

  it('extracts cover from enclosure attribute', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.items[0].cover).toBe('https://img.com/1.jpg');
    expect(result.items[1].cover).toBeNull();
  });

  it('parses pubDate correctly', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.items[0].publishedAt).toBeInstanceOf(Date);
    expect(result.items[0].publishedAt.getFullYear()).toBe(2026);
  });

  it('handles single item (not array)', () => {
    const singleItemRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <item>
      <title>Only Item</title>
      <link>https://example.com</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;
    const result = parseRssXml(singleItemRss, DEFAULT_FIELD_MAPPING);
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Only Item');
  });

  it('handles empty channel (no items)', () => {
    const emptyRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
  </channel>
</rss>`;
    const result = parseRssXml(emptyRss, DEFAULT_FIELD_MAPPING);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('returns error for invalid XML structure', () => {
    const invalidRss = `<?xml version="1.0"?><feed><entry>Not RSS</entry></feed>`;
    const result = parseRssXml(invalidRss, DEFAULT_FIELD_MAPPING);
    expect(result.total).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Invalid RSS XML');
  });

  it('statistics are consistent: total === successCount + failedCount', () => {
    const result = parseRssXml(minimalRss, DEFAULT_FIELD_MAPPING);
    expect(result.total).toBe(result.successCount + result.failedCount);
  });

  it('supports custom field mapping', () => {
    const customRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <headline>Custom Title</headline>
      <body>Custom body content</body>
      <date>Wed, 01 Jan 2025 12:00:00 +0000</date>
      <url>https://custom.com/article</url>
    </item>
  </channel>
</rss>`;
    const customMapping = {
      title: 'headline',
      content: 'body',
      publishedAt: 'date',
      link: 'url',
      cover: 'image[src]',
    };
    const result = parseRssXml(customRss, customMapping);
    expect(result.items[0].title).toBe('Custom Title');
    expect(result.items[0].content).toBe('Custom body content');
    expect(result.items[0].link).toBe('https://custom.com/article');
    expect(result.items[0].cover).toBeNull();
  });
});
