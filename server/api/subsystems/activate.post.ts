import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export default defineEventHandler(async (event) => {
  // The site auth middleware protects this route. Fail closed if auth is unset.
  if (!useRuntimeConfig().sitePassword) throw createError({ statusCode: 503, message: '尚未配置系统切换权限' });
  const origin = getHeader(event, 'origin');
  let sameOrigin = !origin;
  try { if (origin) sameOrigin = new URL(origin).host === getHeader(event, 'host'); } catch {}
  if (!sameOrigin) throw createError({ statusCode: 403, message: '跨站请求已拒绝' });
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, message: '请求格式无效' });
  const input = await readBody<{ system?: string }>(event);
  if (!['ocean', 'low-carbon'].includes(input?.system || '')) throw createError({ statusCode: 400, message: '请选择有效的研究子系统' });
  try {
    const { stdout } = await execute('/usr/bin/python3', ['/opt/knowledge-base/deploy/switch-research-subsystem.py', input.system!], { timeout: 110000, maxBuffer: 16384 });
    const result = JSON.parse(stdout);
    if (!result.ready) throw createError({ statusCode: result.status || 503, message: result.error || '研究服务暂未就绪' });
    return { system: result.system, ready: true };
  } catch (error: any) {
    if (error.statusCode) throw error;
    throw createError({ statusCode: 503, message: '研究服务暂未切换完成；已保存数据保留，请稍后重试' });
  }
});
