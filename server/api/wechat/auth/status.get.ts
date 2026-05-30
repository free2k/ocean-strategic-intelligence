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

    // Collect any new cookies from the ask response and merge with session cookies
    const askSetCookies = askResponse.headers.getSetCookie();
    let updatedSessionCookies = sessionCookies;
    if (askSetCookies.length > 0) {
      const newCookieParts = askSetCookies.map((c) => c.split(';')[0]);
      // Merge: new cookies override existing ones with same name
      const cookieMap = new Map<string, string>();
      for (const part of sessionCookies.split(';').map(s => s.trim()).filter(Boolean)) {
        const name = part.split('=')[0];
        cookieMap.set(name, part);
      }
      for (const part of newCookieParts) {
        const name = part.split('=')[0];
        cookieMap.set(name, part);
      }
      updatedSessionCookies = Array.from(cookieMap.values()).join('; ');
    }

    const askData = await askResponse.json() as {
      status?: number;
      user_category?: number;
      wx_code?: number;
    };

    const scanStatus = askData.status;

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
          Cookie: updatedSessionCookies,
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

    // Merge session cookies with login response cookies.
    // Session cookies from startlogin (e.g., data_bizuin, data_ticket, bizuin) are needed
    // for subsequent API calls. The login response may only set new cookies (slave_sid, etc.)
    // without re-issuing the session cookies.
    //
    // Convert session cookie string "name1=val1; name2=val2" into Set-Cookie-like format
    // so parseCookieString can handle them uniformly.
    const sessionCookieParts = updatedSessionCookies
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean);

    // Login response cookies take precedence (they're full Set-Cookie headers)
    // Session cookies fill in any gaps
    const allCookies = [...sessionCookieParts, ...loginSetCookies];

    // Generate a unique authKey
    const authKey = randomUUID();

    // Store in CookieStore
    await cookieStore.setCookie(authKey, token, allCookies);

    // Step 4: Fetch user info (nickname, avatar)
    // Use the properly parsed cookies from CookieStore (which has deduplication logic)
    let nickname: string | undefined;
    let avatar: string | undefined;

    try {
      const storedCookieString = await cookieStore.getCookie(authKey);
      if (!storedCookieString) {
        console.warn('[WeChat Auth Status] Could not retrieve stored cookies for home page request');
      } else {
        const homeUrl = `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&token=${token}&lang=zh_CN`;

        const homeResponse = await fetch(homeUrl, {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Referer: 'https://mp.weixin.qq.com/',
            Cookie: storedCookieString,
          },
          redirect: 'follow',
        });

        if (homeResponse.ok) {
          const html = await homeResponse.text();

          // Extract nickname from: wx.cgiData.nick_name = "xxx"
          const nicknameMatch = html.match(/wx\.cgiData\.nick_name\s*?=\s*?"([^"]+)"/);
          if (nicknameMatch?.[1]) {
            nickname = nicknameMatch[1];
          }

          // Extract avatar from: wx.cgiData.head_img = "xxx"
          const headImgMatch = html.match(/wx\.cgiData\.head_img\s*?=\s*?"([^"]+)"/);
          if (headImgMatch?.[1]) {
            avatar = headImgMatch[1];
          }

          if (!nickname && !avatar) {
            console.warn('[WeChat Auth Status] Home page fetched but no nick_name/head_img found. HTML length:', html.length, 'First 500 chars:', html.substring(0, 500));
          } else {
            console.log('[WeChat Auth Status] User info extracted:', { nickname, avatar: avatar?.substring(0, 50) });
          }
        } else {
          console.warn('[WeChat Auth Status] Home page fetch failed with status:', homeResponse.status);
        }
      }
    } catch (err) {
      // Non-critical: user info fetch failure doesn't block login
      console.warn('[WeChat Auth Status] Failed to fetch user info:', err);
    }

    // Store nickname/avatar in CookieStore for later retrieval
    if (nickname || avatar) {
      await cookieStore.updateUserInfo(authKey, nickname, avatar);
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
