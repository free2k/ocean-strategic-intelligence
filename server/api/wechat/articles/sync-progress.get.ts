import { syncTasks } from './sync.post';

interface ProgressResponse {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  total: number;
  synced: number;
  currentPage: number;
  message?: string;
  elapsed: number; // seconds since start
}

/**
 * GET /api/wechat/articles/sync-progress?taskId=xxx
 *
 * Returns the current progress of a sync task.
 */
export default defineEventHandler(async (event): Promise<ProgressResponse> => {
  const query = getQuery(event);
  const taskId = query.taskId as string;

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 taskId 参数',
    });
  }

  const task = syncTasks.get(taskId);
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: '未找到同步任务',
    });
  }

  return {
    taskId: task.taskId,
    status: task.status,
    total: task.total,
    synced: task.synced,
    currentPage: task.currentPage,
    message: task.message,
    elapsed: Math.round((Date.now() - task.startedAt) / 1000),
  };
});
