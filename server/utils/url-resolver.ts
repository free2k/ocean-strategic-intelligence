export interface ResolveResult {
  originalUrl: string;
  finalUrl: string;
  redirectCount: number;
  success: boolean;
  error?: string;
}

export interface ResolveOptions {
  timeout?: number;      // default 10000ms
  maxRedirects?: number; // default 5
}

export async function resolveShortUrl(url: string, options?: ResolveOptions): Promise<ResolveResult> {
  const timeout = options?.timeout ?? 10000;
  const maxRedirects = options?.maxRedirects ?? 5;

  let currentUrl = url;
  let redirectCount = 0;

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeBase/1.0)',
          },
        });

        clearTimeout(timeoutId);

        // Check for redirect status codes (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            return { originalUrl: url, finalUrl: currentUrl, redirectCount, success: true };
          }
          // Handle relative URLs
          currentUrl = new URL(location, currentUrl).href;
          redirectCount++;
          continue;
        }

        // Non-redirect response - we've reached the final URL
        if (response.ok || response.status < 400) {
          return { originalUrl: url, finalUrl: currentUrl, redirectCount, success: true };
        }

        // Error status code
        return {
          originalUrl: url,
          finalUrl: currentUrl,
          redirectCount,
          success: false,
          error: `HTTP ${response.status}`,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
          return {
            originalUrl: url,
            finalUrl: currentUrl,
            redirectCount,
            success: false,
            error: 'Request timeout',
          };
        }
        throw err;
      }
    }

    // Exceeded max redirects
    return {
      originalUrl: url,
      finalUrl: currentUrl,
      redirectCount,
      success: false,
      error: `Exceeded maximum redirects (${maxRedirects})`,
    };
  } catch (err: any) {
    return {
      originalUrl: url,
      finalUrl: url,
      redirectCount,
      success: false,
      error: err.message || 'Network error',
    };
  }
}
