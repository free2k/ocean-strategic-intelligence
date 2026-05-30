import { randomUUID } from 'node:crypto';
import { cookieStore } from '../../../utils/wechat/cookie-store';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

interface AuthStatusResponse {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired';
  nickname?: string;
  avatar?: string;
  authKey?: string;
}

/**
 * GET /api/wechat/auth/status?sessionId=xxx
 *
 * Polls the scan status of a WeChat MP QR code login session.
 *
 * Flow:
 * 1. Retrieve stored session cookies using the sessionId
 * 2. Call WeChat's scanloginqrcode?action=ask to check scan status
 * 3. If confirmed (status=1), complete the bizlogin flow:
 *    a. POST to bizlogin?action=login to finalize login
 *    b. Extract token from redirect URL
 *    c. Generate authKey and store cookies in CookieStore
 *    d. Optionally fetch user info (nickname, avatar)
 * 4. Clean up the temporary login session
 */
export default defineEventHandler(async (event): Promise<AuthStatusResponse> => {
  const query = getQuery(event);
  const sessionId = query.sessionId as string;

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 sessionId 参数',
    });
  }

  // Retrieve stored session cookies
  const { getLoginSession, removeLoginSession } = useLoginSessionStore();
  const sessionCookies = getLoginSession(sessionId);

  if (!sessionCookies) {
    return { status: 'expired' };
  }

  try {
    // Step 1: Check scan status
    const askUrl = `https://mp.weixin.qq.com/cgi-bin/scanloginqrcode?action=ask&token=&lang=zh_CN&f=json&ajax=1`;

    const askResponse = await fetch(askUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://mp.weixin.qq.com/',
        Cookie: sessionCookies,
      },
    });

    if (!askResponse.ok) {
      return { status: 'expired' };
    }

    const askData = await askResponse.json() as {
      status?: number;
      user_category?: number;
      wx_code?: number;
    };

    const scanStatus = askData.status;

    // Log for debugging
    console.log('[WeChat Auth Status] Scan status:', scanStatus, 'Full response:', JSON.stringify(askData));

    // Step 2: Map WeChat status codes to our status
    if (scanStatus === 0) {
      return { status: 'waiting' };
    }

    if (scanStatus === 4) {
      return { status: 'scanned' };
    }

    if (scanStatus !== 1) {
      // Unknown status or error
      return { status: 'expired' };
    }

    // Step 3: Status is 1 (confirmed) — complete the bizlogin flow
    const loginBody = new URLSearchParams({
      userlang: 'zh_CN',
      redirect_url: '',
      cookie_forbidden: '0',
      cookie_cleaned: '0',
      plugin_used: '0',
      login_type: '3',
      token: '',
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    });

    const loginResponse = await fetch(
      'https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login',
      {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://mp.weixin.qq.com/',
          Origin: 'https://mp.weixin.qq.com',
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: sessionCookies,
        },
        body: loginBody.toString(),
      },
    );

    // Extract token from the redirect URL in the JSON response
    const loginData = await loginResponse.json() as {
      base_resp?: { ret?: number; err_msg?: string };
      redirect_url?: string;
    };

    // The original project doesn't check base_resp.ret for the login response,
    // it only checks for redirect_url presence
    const redirectUrl = loginData.redirect_url || '';
    if (!redirectUrl) {
      console.error('[WeChat Auth Status] No redirect_url in login response, data:', JSON.stringify(loginData));
      return { status: 'expired' };
    }

    let token = '';
    try {
      token = new URL(`http://localhost${redirectUrl}`).searchParams.get('token') || '';
    } catch {
      const tokenMatch = redirectUrl.match(/token=(\d+)/);
      token = tokenMatch ? tokenMatch[1] : '';
    }

    if (!token) {
      console.error('[WeChat Auth Status] Failed to extract token from redirect URL:', redirectUrl);
      return { status: 'expired' };
    }

    // Collect all Set-Cookie headers from the login response
    const loginSetCookies = loginResponse.headers.getSetCookie();

    // Merge original session cookies with new login cookies
    const allCookies = [...parseCookieHeaders(sessionCookies), ...loginSetCookies];

    // Generate a unique authKey
    const authKey = randomUUID();

    // Store in CookieStore
    await cookieStore.setCookie(authKey, token, allCookies);

    // Step 4: Fetch user info (nickname, avatar)
    let nickname: string | undefined;
    let avatar: string | undefined;

    try {
      const mergedCookieString = allCookies.map((c) => c.split(';')[0]).join('; ');
      const userInfoUrl = `https://mp.weixin.qq.com/cgi-bin/settingpage?action=index&t=setting/index&token=${token}&lang=zh_CN&f=json&ajax=1`;

      const userInfoResponse = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Referer: `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&token=${token}&lang=zh_CN`,
          Cookie: mergedCookieString,
        },
      });

      if (userInfoResponse.ok) {
        const userInfoData = await userInfoResponse.json() as {
          nickname?: string;
          head_img?: string;
          setting_list?: Array<{ nick_name?: string; head_img?: string }>;
        };

        nickname = userInfoData.nickname || userInfoData.setting_list?.[0]?.nick_name;
        avatar = userInfoData.head_img || userInfoData.setting_list?.[0]?.head_img;
      }
    } catch (err) {
      // Non-critical: user info fetch failure doesn't block login
      console.warn('[WeChat Auth Status] Failed to fetch user info:', err);
    }

    // Step 5: Clean up the temporary login session
    removeLoginSession(sessionId);

    return {
      status: 'confirmed',
      authKey,
      nickname,
      avatar,
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('[WeChat Auth Status] Polling error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: '检查扫码状态失败',
    });
  }
});

/**
 * Convert a cookie string (e.g., "name1=value1; name2=value2") back into
 * individual Set-Cookie-like strings for storage.
 */
function parseCookieHeaders(cookieString: string): string[] {
  return cookieString
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean);
}
