/** 登出 */
export default defineEventHandler((event) => {
  deleteCookie(event, 'site_auth', { path: '/' });
  return { success: true };
});
