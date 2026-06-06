import { createHmac } from 'node:crypto';

/** 站点登录验证 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody<{ password: string }>(event);

  if (!config.sitePassword) {
    // 未配置密码，直接通过
    return { success: true };
  }

  if (!body?.password) {
    throw createError({ statusCode: 400, message: '请输入密码' });
  }

  if (body.password !== config.sitePassword) {
    throw createError({ statusCode: 401, message: '密码错误' });
  }

  // 生成 token（HMAC 签名，有效期写入）
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 天
  const payload = `${expiresAt}`;
  const signature = createHmac('sha256', config.sitePassword).update(payload).digest('hex');
  const token = `${payload}.${signature}`;

  // 设置 Cookie
  setCookie(event, 'site_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 天
    path: '/',
  });

  return { success: true };
});
