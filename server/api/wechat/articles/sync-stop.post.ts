import { syncTasks } from './sync.post';

/**
 * POST /api/wechat/articles/sync-stop
 *
 * Stops a running sync task.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ taskId: string }>(event);
  const { taskId } = body;

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

  if (task.status === 'running') {
    task.status = 'stopped';
    task.message = '用户手动停止';
    task.updatedAt = Date.now();
  }

  return { success: true, message: '同步已停止' };
});
