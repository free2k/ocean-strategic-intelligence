/**
 * 全局向量化后台任务状态
 * 使用 useState + 模块级 AbortController 确保跨组件共享
 */

// 模块级变量（所有组件共享同一实例）
let _abortController: AbortController | null = null;

export function useVectorizeTask() {
  const status = useState<{ running: boolean; message: string; logs: string[] }>('vectorize-status', () => ({ running: false, message: '', logs: [] }));

  function cancel() {
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
    status.value = { running: false, message: '已取消向量化', logs: [] };
    setTimeout(() => { status.value.message = ''; }, 5000);
  }

  function start(sourceId?: number) {
    if (status.value.running) return;

    console.log('[VectorizeTask] 启动向量化, sourceId:', sourceId);
    const abort = new AbortController();
    _abortController = abort;
    status.value = { running: true, message: '正在学习已分类知识(向量化)...', logs: [] };

    const body: any = { all: true };
    if (sourceId) body.sourceId = sourceId;

    fetch('/api/articles/vectorize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    }).then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastResult = { vectorized: 0, total: 0 };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'start' && data.total === 0) {
                status.value = { running: false, message: '没有需要向量化的文章', logs: [] };
                _abortController = null;
                setTimeout(() => { status.value.message = ''; }, 5000);
                return;
              }
              if (data.type === 'progress') {
                const logLine = `${data.current}/${data.total}: ${data.title || ''}`;
                const logs = [...status.value.logs, logLine].slice(-50);
                status.value = { running: true, message: `向量化 ${logLine}`, logs };
              } else if (data.type === 'done') {
                lastResult = { vectorized: data.vectorized, total: data.total };
              }
            } catch {}
          }
        }

        _abortController = null;
        status.value = { running: false, message: `✅ 向量化完成: ${lastResult.vectorized}/${lastResult.total} 篇`, logs: status.value.logs };
        setTimeout(() => { status.value = { running: false, message: '', logs: [] }; }, 10000);
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        throw e;
      }
    }).catch((e) => {
      if (e.name === 'AbortError') return;
      _abortController = null;
      status.value = { running: false, message: `❌ 向量化失败: ${e.message}`, logs: [] };
      setTimeout(() => { status.value = { running: false, message: '', logs: [] }; }, 10000);
    });
  }

  return { status, start, cancel };
}
