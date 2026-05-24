import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export interface ExtractResult {
  content: string;
  title?: string;
  success: boolean;
  error?: string;
}

export interface ExtractOptions {
  timeout?: number;  // default 15000ms
}

export async function extractArticleContent(url: string, options?: ExtractOptions): Promise<ExtractResult> {
  const timeout = options?.timeout ?? 15000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        content: '',
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    if (!html || html.trim().length === 0) {
      return {
        content: '',
        success: false,
        error: 'Empty response body',
      };
    }

    // Parse HTML with linkedom
    const { document } = parseHTML(html);

    // Use Readability to extract article content
    const reader = new Readability(document as any);
    const article = reader.parse();

    if (!article || !article.textContent) {
      return {
        content: '',
        success: false,
        error: 'Readability could not extract article content',
      };
    }

    return {
      content: article.textContent.trim(),
      title: article.title || undefined,
      success: true,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        content: '',
        success: false,
        error: 'Request timeout',
      };
    }

    return {
      content: '',
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}
