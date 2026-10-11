import { createHmac } from 'node:crypto';

/** 检查登录状态 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();

  // 未配置密码，无需验证
  if (!config.sitePassword) {
    return { authenticated: true };
  }

  const token = getCookie(event, 'site_auth');
  if (!token) {
    return { authenticated: false };
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return { authenticated: false };
  }

  // 验证签名
  const expected = createHmac('sha256', config.sitePassword).update(payload).digest('hex');
  if (signature !== expected) {
    return { authenticated: false };
  }

  // 验证有效期
  const expiresAt = parseInt(payload);
  if (Date.now() > expiresAt) {
    return { authenticated: false };
  }

  return { authenticated: true };
});
