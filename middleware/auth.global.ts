/**
 * 前端路由守卫（处理客户端导航时的拦截）
 * 主要保护由 server/middleware/auth.ts 完成
 * 这里作为客户端 SPA 导航的补充检查
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return;

  // 只在客户端执行（SSR 由 server middleware 处理）
  if (import.meta.server) return;

  try {
    const res = await $fetch('/api/auth/check');
    if (res?.authenticated) return;
  } catch {}

  return navigateTo('/login');
});
