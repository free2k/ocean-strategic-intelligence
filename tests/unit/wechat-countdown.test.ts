import { describe, it, expect } from 'vitest';
import { formatCountdown, isExpiringSoon } from '../../utils/wechat-countdown';

describe('formatCountdown', () => {
  it('returns "已过期" when expiresAt equals now', () => {
    const now = Date.now();
    expect(formatCountdown(now, now)).toBe('已过期');
  });

  it('returns "已过期" when expiresAt is in the past', () => {
    const now = Date.now();
    expect(formatCountdown(now - 1000, now)).toBe('已过期');
  });

  it('formats days/hours/minutes when remaining >= 1 day', () => {
    const now = 0;
    // 2 days, 3 hours, 15 minutes
    const expiresAt = (2 * 24 * 60 * 60 + 3 * 60 * 60 + 15 * 60) * 1000;
    expect(formatCountdown(expiresAt, now)).toBe('2天 3小时 15分');
  });

  it('formats hours/minutes/seconds when remaining < 1 day', () => {
    const now = 0;
    // 5 hours, 30 minutes, 45 seconds
    const expiresAt = (5 * 60 * 60 + 30 * 60 + 45) * 1000;
    expect(formatCountdown(expiresAt, now)).toBe('5小时 30分 45秒');
  });

  it('formats exactly 1 day as days format', () => {
    const now = 0;
    const expiresAt = 24 * 60 * 60 * 1000;
    expect(formatCountdown(expiresAt, now)).toBe('1天 0小时 0分');
  });

  it('formats just under 1 day as hours format', () => {
    const now = 0;
    const expiresAt = 24 * 60 * 60 * 1000 - 1000; // 23h 59m 59s
    expect(formatCountdown(expiresAt, now)).toBe('23小时 59分 59秒');
  });

  it('formats 1 second remaining', () => {
    const now = 0;
    const expiresAt = 1000;
    expect(formatCountdown(expiresAt, now)).toBe('0小时 0分 1秒');
  });

  it('formats 4 days correctly', () => {
    const now = 0;
    const expiresAt = 4 * 24 * 60 * 60 * 1000;
    expect(formatCountdown(expiresAt, now)).toBe('4天 0小时 0分');
  });
});

describe('isExpiringSoon', () => {
  it('returns true when remaining is less than 1 hour', () => {
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 minutes
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });

  it('returns true when remaining is 1 second', () => {
    const now = Date.now();
    const expiresAt = now + 1000;
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });

  it('returns false when remaining is exactly 1 hour', () => {
    const now = Date.now();
    const expiresAt = now + 3600000;
    expect(isExpiringSoon(expiresAt, now)).toBe(false);
  });

  it('returns false when remaining is more than 1 hour', () => {
    const now = Date.now();
    const expiresAt = now + 2 * 3600000;
    expect(isExpiringSoon(expiresAt, now)).toBe(false);
  });

  it('returns false when already expired (remaining <= 0)', () => {
    const now = Date.now();
    expect(isExpiringSoon(now, now)).toBe(false);
    expect(isExpiringSoon(now - 1000, now)).toBe(false);
  });

  it('returns true at 59 minutes 59 seconds remaining', () => {
    const now = Date.now();
    const expiresAt = now + 59 * 60 * 1000 + 59 * 1000;
    expect(isExpiringSoon(expiresAt, now)).toBe(true);
  });
});
