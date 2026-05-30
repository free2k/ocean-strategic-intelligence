/**
 * Format the remaining time until expiry as a human-readable countdown string.
 *
 * - If remaining >= 1 day: "X天 Y小时 Z分"
 * - If remaining < 1 day: "X小时 Y分 Z秒"
 * - If expired (remaining <= 0): "已过期"
 */
export function formatCountdown(expiresAt: number, now: number): string {
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return '已过期';
  }

  const seconds = Math.floor(remaining / 1000) % 60;
  const minutes = Math.floor(remaining / (1000 * 60)) % 60;
  const hours = Math.floor(remaining / (1000 * 60 * 60)) % 24;
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分`;
  }

  return `${hours}小时 ${minutes}分 ${seconds}秒`;
}

/**
 * Check if the login session is expiring soon (less than 1 hour remaining).
 * Returns true if remaining time is less than 1 hour and greater than 0.
 */
export function isExpiringSoon(expiresAt: number, now: number): boolean {
  const remaining = expiresAt - now;
  return remaining > 0 && remaining < 3600000; // 1 hour in ms
}
