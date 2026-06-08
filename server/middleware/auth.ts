import { createHmac } from 'node:crypto';

/**
 * 全站访问保护中间件
 * - 页面请求：未认证则重定向到 /login
 * - API 请求：未认证则返回 401
 * - 放行：/login 页面、/api/auth/* 接口、静态资源
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();

  // 未配置密码，不启用保护
  if (!config.sitePassword) return;

  const path = getRequestURL(event).pathname;

  // 放行：登录页、auth API、静态资源 (_nuxt, favicon 等)
  if (path === '/login') return;
  if (path.startsWith('/api/auth/')) return;
  if (path.startsWith('/_nuxt/')) return;
  if (path.startsWith('/__nuxt')) return;
  if (/\.(ico|png|jpg|jpeg|svg|css|js|woff2?|ttf|gif|webp)$/.test(path)) return;
  // 放行 Nuxt 内部路由（HMR、manifest 等）
  if (path.startsWith('/_payload')) return;

  // 验证 Cookie
  const token = getCookie(event, 'site_auth');
  const isAuthenticated = verifyToken(token, config.sitePassword);

  if (isAuthenticated) return;

  // 未认证处理
  if (path.startsWith('/api/')) {
    // API 请求返回 401
    throw createError({ statusCode: 401, message: '未登录' });
  } else {
    // 页面请求重定向到登录页
    return sendRedirect(event, '/login', 302);
  }
});

function verifyToken(token: string | undefined, password: string): boolean {
  if (!token) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expected = createHmac('sha256', password).update(payload).digest('hex');
  if (signature !== expected) return false;

  const expiresAt = parseInt(payload);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}
