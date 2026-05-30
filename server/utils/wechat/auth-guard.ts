import type { H3Event } from 'h3';
import { cookieStore } from './cookie-store';

/**
 * Auth credentials extracted from the request and validated against CookieStore.
 */
export interface AuthCredentials {
  authKey: string;
  cookie: string;
  token: string;
}

/**
 * Validates the authKey from the request and returns the associated credentials.
 *
 * Extracts authKey from the `x-auth-key` header or `authKey` query parameter.
 * Checks that the key exists in CookieStore and is not expired.
 *
 * @throws 401 if authKey is missing, expired, or not found in CookieStore
 */
export async function useAuthGuard(event: H3Event): Promise<AuthCredentials> {
  const authKey = getHeader(event, 'x-auth-key') || (getQuery(event).authKey as string);

  if (!authKey) {
    throw createError({
      statusCode: 401,
      statusMessage: '登录已过期，请重新登录',
    });
  }

  if (cookieStore.isExpired(authKey)) {
    cookieStore.removeCookie(authKey);
    throw createError({
      statusCode: 401,
      statusMessage: '登录已过期，请重新登录',
    });
  }

  const cookie = await cookieStore.getCookie(authKey);
  const token = await cookieStore.getToken(authKey);

  if (!cookie || !token) {
    throw createError({
      statusCode: 401,
      statusMessage: '登录已过期，请重新登录',
    });
  }

  return { authKey, cookie, token };
}

/**
 * Checks a WeChat API response for session expiration (ret=200003).
 * If the session has expired, removes the authKey from CookieStore and throws a 401 error.
 * Otherwise returns the response data as-is.
 *
 * @param data - Parsed JSON response from a WeChat API call
 * @param authKey - The authKey associated with the current session
 * @returns The response data if no session error is detected
 * @throws 401 if the response indicates session expiration (ret=200003)
 */
export function handleWechatError<T extends Record<string, any>>(data: T, authKey: string): T {
  // WeChat uses base_resp.ret or top-level ret to indicate errors
  const ret = data.base_resp?.ret ?? data.ret;

  if (ret === 200003) {
    cookieStore.removeCookie(authKey);
    throw createError({
      statusCode: 401,
      statusMessage: '登录已过期，请重新登录',
    });
  }

  return data;
}
