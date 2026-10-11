import type { H3Event } from 'h3';
import { articleDownloader, type DownloadProgressEvent } from '../../../utils/wechat/article-downloader';

interface DownloadStartBody {
  articleIds: number[];
  concurrency?: number;
}

/**
 * POST /api/wechat/download/start
 *
 * Starts downloading articles and streams progress via SSE.
 * Sends real-time events for each article's download status (progress/completed/deleted/failed/finish).
 * When the download finishes, sends final statistics and closes the connection.
 *
 * Body:
 * - articleIds (required): Array of article IDs to download
 * - concurrency (optional): Maximum concurrent downloads, default 3
 *
 * SSE event format: data: JSON\n\n
 *
 * Requirements: 4.2, 4.6
 */
export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody<DownloadStartBody>(event);

  if (!body.articleIds || !Array.isArray(body.articleIds) || body.articleIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填字段：articleIds（非空数组）',
    });
  }

  const { articleIds, concurrency = 3 } = body;

  // Set SSE response headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Disable response buffering for real-time streaming
  setResponseStatus(event, 200);

  const res = event.node.res;

  // Helper to send an SSE event
  const sendEvent = (data: DownloadProgressEvent) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Handle client disconnect
  let clientDisconnected = false;
  res.on('close', () => {
    clientDisconnected = true;
    articleDownloader.stop();
  });

  try {
    // Start downloading with progress callback
    await articleDownloader.start(articleIds, concurrency, (progressEvent) => {
      if (!clientDisconnected) {
        sendEvent(progressEvent);
      }
    });
  } catch (error: any) {
    // Send error event if something unexpected happens
    if (!clientDisconnected && !res.writableEnded) {
      const errorEvent: DownloadProgressEvent = {
        type: 'failed',
        articleId: 0,
        stats: {
          completed: 0,
          failed: articleIds.length,
          deleted: 0,
          total: articleIds.length,
        },
      };
      sendEvent(errorEvent);
    }
  } finally {
    // Close the SSE connection
    if (!res.writableEnded) {
      res.end();
    }
  }

  // Return nothing - response is handled via streaming
  return '';
});
