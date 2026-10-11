import { cookieStore } from '../../../utils/wechat/cookie-store';

/**
 * GET /api/wechat/auth/me?authKey=xxx
 *
 * Returns the stored user info (nickname, avatar, expiry) for the given authKey.
 * Used by the frontend to recover login state when localStorage is intact but
 * needs server-side validation.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const authKey = (query.authKey as string) || getHeader(event, 'x-auth-key');

  if (!authKey) {
    return { loggedIn: false };
  }

  if (await cookieStore.isExpired(authKey)) {
    cookieStore.removeCookie(authKey);
    return { loggedIn: false };
  }

  const userInfo = await cookieStore.getUserInfo(authKey);
  return {
    loggedIn: true,
    nickname: userInfo?.nickname || '',
    avatar: userInfo?.avatar || '',
  };
});
