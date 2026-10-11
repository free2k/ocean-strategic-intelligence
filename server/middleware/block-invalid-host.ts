/**
 * 拦截非法 Host 请求（前导零 IP 扫描等）
 * 避免 Invalid URL 报错刷屏日志
 */
export default defineEventHandler((event) => {
  const host = getRequestHeader(event, 'host') || '';

  // 拒绝前导零格式的 IP（如 049.233.077.111）— 这是扫描器特征
  // 正常 IP 访问（如 49.233.77.111）不受影响
  const hasLeadingZeroIP = /\b0\d+\./.test(host);

  if (!host || hasLeadingZeroIP) {
    setResponseStatus(event, 400);
    return 'Bad Request';
  }
});
