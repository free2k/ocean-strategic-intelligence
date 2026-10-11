import { randomUUID } from 'node:crypto';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

/**
 * GET /api/wechat/auth/qrcode
 *
 * Initiates a WeChat MP login session and returns the QR code image as base64.
 *
 * Flow:
 * 1. POST to WeChat MP bizlogin?action=startlogin to create a session (gets uuid cookie)
 * 2. GET the QR code image from scanloginqrcode?action=getqrcode
 * 3. Convert the image to base64 data URL
 * 4. Store the session cookies temporarily for later use during polling
 */
export default defineEventHandler(async (event) => {
  try {
    // Step 1: Create a new login session to get the uuid cookie
    const sid = Date.now().toString() + Math.floor(Math.random() * 100);

    const startLoginBody = new URLSearchParams({
      userlang: 'zh_CN',
      redirect_url: '',
      login_type: '3',
      sessionid: sid,
      token: '',
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    });

    const sessionResponse = await fetch(
      'https://mp.weixin.qq.com/cgi-bin/bizlogin?action=startlogin',
      {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://mp.weixin.qq.com/',
          Origin: 'https://mp.weixin.qq.com',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: startLoginBody.toString(),
      },
    );

    if (!sessionResponse.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: '无法连接微信公众号平台',
      });
    }

    // Extract uuid cookie from the response
    const setCookies = sessionResponse.headers.getSetCookie();
    const uuidCookie = setCookies.find((c) => c.startsWith('uuid='));

    if (!uuidCookie) {
      throw createError({
        statusCode: 502,
        statusMessage: '未获取到登录会话标识',
      });
    }

    // Parse all cookies for forwarding
    const cookieString = setCookies
      .map((c) => c.split(';')[0])
      .join('; ');

    // Step 2: Get the QR code image using the session cookies
    const qrcodeUrl = `https://mp.weixin.qq.com/cgi-bin/scanloginqrcode?action=getqrcode&random=${Math.random()}`;

    const qrcodeResponse = await fetch(qrcodeUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://mp.weixin.qq.com/',
        Cookie: cookieString,
      },
    });

    if (!qrcodeResponse.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: '获取二维码图片失败',
      });
    }

    // Step 3: Convert image to base64 data URL
    const imageBuffer = await qrcodeResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const contentType = qrcodeResponse.headers.get('content-type') || 'image/jpeg';
    const imageUrl = `data:${contentType};base64,${base64Image}`;

    // Step 4: Generate a temporary session ID and store cookies for polling
    // We use a sessionId that the client will pass back during status polling
    const sessionId = randomUUID().replace(/-/g, '');

    // Store session cookies in a temporary in-memory map for the polling phase
    // This will be used by the status polling endpoint to check scan status
    const { setLoginSession } = useLoginSessionStore();
    setLoginSession(sessionId, cookieString);

    return {
      success: true,
      imageUrl,
      sessionId,
    };
  } catch (error: any) {
    // Re-throw H3 errors as-is
    if (error.statusCode) {
      throw error;
    }

    console.error('[WeChat QRCode] Failed to get QR code:', error);
    throw createError({
      statusCode: 500,
      statusMessage: '获取登录二维码失败',
    });
  }
});
