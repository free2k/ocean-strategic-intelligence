import { cookieStore } from '../../../utils/wechat/cookie-store';

interface LogoutResponse {
  success: boolean;
}

/**
 * POST /api/wechat/auth/logout
 *
 * Clears the stored credentials for the given authKey from the CookieStore.
 * The authKey can be provided via the request body or the `x-auth-key` header.
 */
export default defineEventHandler(async (event): Promise<LogoutResponse> => {
  // Read authKey from body or header
  const body = await readBody(event).catch(() => null);
  const authKey = body?.authKey || getHeader(event, 'x-auth-key');

  if (!authKey) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 authKey 参数',
    });
  }

  cookieStore.removeCookie(authKey);

  return { success: true };
});
