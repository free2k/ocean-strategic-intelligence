/**
 * 全局前端路由守卫
 * 未登录时跳转到 /login 页面
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // 登录页本身不拦截
  if (to.path === '/login') return;

  // 检查登录状态
  const { data } = await useFetch('/api/auth/check');
  if (data.value?.authenticated) return;

  return navigateTo('/login');
});
