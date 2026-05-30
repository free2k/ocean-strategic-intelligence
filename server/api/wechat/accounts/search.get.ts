import { useAuthGuard, handleWechatError } from '../../../utils/wechat/auth-guard';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

interface AccountInfo {
  fakeid: string;
  nickname: string;
  alias: string;
  avatar: string;
  serviceType: number;
}

interface AccountSearchResponse {
  list: AccountInfo[];
  isCompleted: boolean;
}

/**
 * GET /api/wechat/accounts/search?keyword=xxx&begin=0
 *
 * Searches for WeChat official accounts by keyword via the WeChat MP platform API.
 * Requires a valid auth session (authKey).
 *
 * Query params:
 * - keyword (required): Search keyword
 * - begin (optional): Pagination offset, default 0
 *
 * Returns a list of matching accounts and whether the search results are complete.
 *
 * Requirements: 2.1
 */
export default defineEventHandler(async (event): Promise<AccountSearchResponse> => {
  const { authKey, cookie, token } = await useAuthGuard(event);

  const query = getQuery(event);
  const keyword = query.keyword as string;
  const begin = Number(query.begin) || 0;

  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少搜索关键词',
    });
  }

  try {
    const searchUrl = `https://mp.weixin.qq.com/cgi-bin/searchbiz?action=search_biz&begin=${begin}&count=5&query=${encodeURIComponent(keyword)}&token=${token}&lang=zh_CN&f=json&ajax=1`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${token}&lang=zh_CN`,
        Cookie: cookie,
      },
    });

    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: '无法连接微信公众号平台',
      });
    }

    const data = await response.json() as {
      base_resp: { ret: number; err_msg: string };
      list: Array<{
        fakeid: string;
        nickname: string;
        alias: string;
        round_head_img: string;
        service_type: number;
      }>;
      total: number;
    };

    handleWechatError(data, authKey);

    const list: AccountInfo[] = (data.list || []).map((item) => ({
      fakeid: item.fakeid,
      nickname: item.nickname,
      alias: item.alias,
      avatar: item.round_head_img,
      serviceType: item.service_type,
    }));

    const isCompleted = begin + list.length >= data.total;

    return {
      list,
      isCompleted,
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('[WeChat Account Search] Failed to search accounts:', error);
    throw createError({
      statusCode: 500,
      statusMessage: '搜索公众号失败',
    });
  }
});
