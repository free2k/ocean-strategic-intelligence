import { ref } from 'vue';

export interface DownloadProgress {
  completed: number;
  failed: number;
  deleted: number;
}

export interface DownloadStats {
  completed: number;
  failed: number;
  deleted: number;
  total: number;
}

interface SSEEvent {
  type: 'progress' | 'completed' | 'deleted' | 'failed' | 'finish';
  articleId: number;
  url?: string;
  stats?: DownloadStats;
}

// Module-level state shared across all component instances
const loading = ref(false);
const progress = ref<DownloadProgress>({ completed: 0, failed: 0, deleted: 0 });
const total = ref(0);
const stats = ref<DownloadStats | null>(null);

let abortController: AbortController | null = null;

/**
 * Composable for managing WeChat article download with SSE progress streaming.
 *
 * Since the download endpoint is a POST (not GET), we use fetch with
 * response.body.getReader() to consume the SSE stream manually instead
 * of native EventSource.
 *
 * Requirements: 4.2, 4.6, 4.7
 */
export function useWechatDownload() {
  /**
   * Start downloading articles. Connects to the SSE endpoint and
   * updates progress state in real-time as events arrive.
   *
   * @param articleIds - Array of article IDs to download
   * @param concurrency - Maximum concurrent downloads (default 3)
   */
  async function start(articleIds: number[], concurrency?: number) {
    // Reset state
    loading.value = true;
    progress.value = { completed: 0, failed: 0, deleted: 0 };
    total.value = articleIds.length;
    stats.value = null;

    // Create abort controller for manual stop
    abortController = new AbortController();

    try {
      const response = await fetch('/api/wechat/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleIds, concurrency }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        console.error('[useWechatDownload] Server responded with:', response.status);
        loading.value = false;
        return;
      }

      if (!response.body) {
        console.error('[useWechatDownload] Response body is null');
        loading.value = false;
        return;
      }

      // Read the SSE stream using ReadableStream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer (format: "data: {...}\n\n")
        const events = buffer.split('\n\n');
        // Keep the last incomplete chunk in the buffer
        buffer = events.pop() || '';

        for (const eventStr of events) {
          const trimmed = eventStr.trim();
          if (!trimmed) continue;

          // Extract data from "data: {...}" format
          const dataPrefix = 'data: ';
          if (!trimmed.startsWith(dataPrefix)) continue;

          const jsonStr = trimmed.slice(dataPrefix.length);
          try {
            const event: SSEEvent = JSON.parse(jsonStr);
            handleEvent(event);
          } catch (e) {
            console.warn('[useWechatDownload] Failed to parse SSE event:', jsonStr);
          }
        }
      }
    } catch (error: any) {
      // AbortError is expected when stop() is called
      if (error.name !== 'AbortError') {
        console.error('[useWechatDownload] Stream error:', error);
      }
    } finally {
      loading.value = false;
      abortController = null;
    }
  }

  /**
   * Handle a parsed SSE event and update reactive state.
   */
  function handleEvent(event: SSEEvent) {
    switch (event.type) {
      case 'completed':
        progress.value = {
          ...progress.value,
          completed: event.stats?.completed ?? progress.value.completed + 1,
        };
        break;

      case 'deleted':
        progress.value = {
          ...progress.value,
          deleted: event.stats?.deleted ?? progress.value.deleted + 1,
        };
        break;

      case 'failed':
        progress.value = {
          ...progress.value,
          failed: event.stats?.failed ?? progress.value.failed + 1,
        };
        break;

      case 'progress':
        // Update all progress fields from stats if available
        if (event.stats) {
          progress.value = {
            completed: event.stats.completed,
            failed: event.stats.failed,
            deleted: event.stats.deleted,
          };
          total.value = event.stats.total;
        }
        break;

      case 'finish':
        if (event.stats) {
          stats.value = event.stats;
          progress.value = {
            completed: event.stats.completed,
            failed: event.stats.failed,
            deleted: event.stats.deleted,
          };
          total.value = event.stats.total;
        }
        loading.value = false;
        break;
    }
  }

  /**
   * Stop the current download task.
   * Aborts the SSE connection and notifies the server to stop.
   *
   * Requirements: 4.7
   */
  async function stop() {
    // Abort the fetch stream
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // Notify server to stop the download task
    try {
      await fetch('/api/wechat/download/stop', { method: 'POST' });
    } catch (error) {
      console.error('[useWechatDownload] Failed to notify server stop:', error);
    }

    loading.value = false;
  }

  return {
    loading,
    progress,
    total,
    stats,
    start,
    stop,
  };
}
