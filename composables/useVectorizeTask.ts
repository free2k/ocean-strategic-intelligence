/**
 * 全局向量化后台任务状态
 * 使用 useState 确保跨组件共享
 */
export function useVectorizeTask() {
  const status = useState<{ running: boolean; message: string }>('vectorize-status', () => ({ running: false, message: '' }));
  const abortKey = useState<string>('vectorize-abort-key', () => '');

  function cancel() {
    // 通过更改 key 来标记取消
    abortKey.value = '';
    status.value = { running: false, message: '已取消向量化' };
    setTimeout(() => { status.value.message = ''; }, 5000);
  }

  function start(sourceId?: number) {
    if (status.value.running) return;

    console.log('[VectorizeTask] 启动向量化, sourceId:', sourceId);
    const currentKey = String(Date.now());
    abortKey.value = currentKey;
    status.value = { running: true, message: '正在学习已分类知识(向量化)...' };

    const body: any = { all: true };
    if (sourceId) body.sourceId = sourceId;

    fetch('/api/articles/vectorize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastResult = { vectorized: 0, total: 0 };

      while (true) {
        // 检查是否被取消
        if (abortKey.value !== currentKey) {
          reader.cancel();
          return;
        }

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
              status.value = { running: false, message: '没有需要向量化的文章' };
              setTimeout(() => { status.value.message = ''; }, 5000);
              return;
            }
            if (data.type === 'progress') {
              status.value = { running: true, message: `向量化 ${data.current}/${data.total}: ${data.title || ''}` };
            } else if (data.type === 'done') {
              lastResult = { vectorized: data.vectorized, total: data.total };
            }
          } catch {}
        }
      }

      if (abortKey.value === currentKey) {
        status.value = { running: false, message: `✅ 向量化完成: ${lastResult.vectorized}/${lastResult.total} 篇` };
        setTimeout(() => { status.value.message = ''; }, 10000);
      }
    }).catch((e) => {
      if (abortKey.value === currentKey) {
        status.value = { running: false, message: `❌ 向量化失败: ${e.message}` };
        setTimeout(() => { status.value.message = ''; }, 10000);
      }
    });
  }

  return { status, start, cancel };
}
