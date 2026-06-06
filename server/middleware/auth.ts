import { createHmac } from 'node:crypto';

/**
 * 全站 API 访问保护中间件
 * 放行: /api/auth/* 路由
 * 拦截: 所有其他 /api/* 路由（需要有效 Cookie）
 * 页面路由由前端 middleware 处理
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();

  // 未配置密码，不启用保护
  if (!config.sitePassword) return;

  const path = getRequestURL(event).pathname;

  // 放行 auth 相关接口
  if (path.startsWith('/api/auth/')) return;

  // 只拦截 API 请求
  if (!path.startsWith('/api/')) return;

  const token = getCookie(event, 'site_auth');
  if (!token) {
    throw createError({ statusCode: 401, message: '未登录' });
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw createError({ statusCode: 401, message: '登录已失效' });
  }

  const expected = createHmac('sha256', config.sitePassword).update(payload).digest('hex');
  if (signature !== expected) {
    throw createError({ statusCode: 401, message: '登录已失效' });
  }

  const expiresAt = parseInt(payload);
  if (Date.now() > expiresAt) {
    throw createError({ statusCode: 401, message: '登录已过期，请重新登录' });
  }
});
