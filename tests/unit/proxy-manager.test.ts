import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProxyManager, type ProxyNode } from '../../server/utils/wechat/proxy-manager';

const TEST_PROXIES: ProxyNode[] = [
  { id: 1, url: 'https://proxy-a.example.com/proxy', name: 'Proxy A', isPublic: true },
  { id: 2, url: 'https://proxy-b.example.com/proxy', name: 'Proxy B', isPublic: true },
  { id: 3, url: 'https://proxy-c.example.com/proxy', name: 'Proxy C', isPublic: true },
];

describe('ProxyManager', () => {
  let manager: ProxyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ProxyManager(TEST_PROXIES);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getBestProxy', () => {
    it('returns a proxy URL from the available list', () => {
      const proxy = manager.getBestProxy();
      const urls = TEST_PROXIES.map((p) => p.url);
      expect(urls).toContain(proxy);
    });

    it('prefers proxy with fewer failures', () => {
      // Record failures on proxy A
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');

      // Record one failure on proxy B
      manager.recordFailure('https://proxy-b.example.com/proxy');

      // Proxy C has 0 failures, should be selected
      const best = manager.getBestProxy();
      expect(best).toBe('https://proxy-c.example.com/proxy');
    });

    it('skips proxies in cooldown', () => {
      // Put proxy A into cooldown (5 failures)
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(true);

      // getBestProxy should not return proxy A
      const best = manager.getBestProxy();
      expect(best).not.toBe('https://proxy-a.example.com/proxy');
    });

    it('resets earliest proxy when all are in cooldown', () => {
      // Put all proxies into cooldown with different lastUsed times
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }
      vi.advanceTimersByTime(100);

      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-b.example.com/proxy');
      }
      vi.advanceTimersByTime(100);

      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-c.example.com/proxy');
      }

      // All in cooldown — should reset the earliest used one (proxy A)
      const best = manager.getBestProxy();
      expect(best).toBe('https://proxy-a.example.com/proxy');

      // Verify it was reset
      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(false);
      expect(status?.failures).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('increments failure count', () => {
      manager.recordFailure('https://proxy-a.example.com/proxy');
      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.failures).toBe(1);
      expect(status?.totalFailures).toBe(1);
    });

    it('enters cooldown after 5 consecutive failures', () => {
      for (let i = 0; i < 4; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }
      let status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(false);

      manager.recordFailure('https://proxy-a.example.com/proxy');
      status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(true);
      expect(status?.failures).toBe(5);
    });

    it('cooldown resets after 60 seconds', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }

      let status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(true);

      // Advance time by 60 seconds
      vi.advanceTimersByTime(60 * 1000);

      status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(false);
      expect(status?.failures).toBe(0);
    });

    it('tracks totalFailures across resets', () => {
      // First round of failures → cooldown
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }

      // Reset via success
      manager.recordSuccess('https://proxy-a.example.com/proxy');

      // Second round of failures
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.totalFailures).toBe(7);
      expect(status?.failures).toBe(2);
    });

    it('updates lastUsed timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
      manager.recordFailure('https://proxy-a.example.com/proxy');

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.lastUsed).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    });
  });

  describe('recordSuccess', () => {
    it('resets failure count to 0', () => {
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordSuccess('https://proxy-a.example.com/proxy');

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.failures).toBe(0);
    });

    it('removes cooldown', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }
      expect(manager.getStatus('https://proxy-a.example.com/proxy')?.cooldown).toBe(true);

      manager.recordSuccess('https://proxy-a.example.com/proxy');
      expect(manager.getStatus('https://proxy-a.example.com/proxy')?.cooldown).toBe(false);
    });

    it('increments totalSuccess', () => {
      manager.recordSuccess('https://proxy-a.example.com/proxy');
      manager.recordSuccess('https://proxy-a.example.com/proxy');

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.totalSuccess).toBe(2);
    });

    it('clears cooldown timer on success', () => {
      // Enter cooldown
      for (let i = 0; i < 5; i++) {
        manager.recordFailure('https://proxy-a.example.com/proxy');
      }

      // Record success (should clear cooldown timer)
      manager.recordSuccess('https://proxy-a.example.com/proxy');

      // Advance time past cooldown period — should not cause issues
      vi.advanceTimersByTime(60 * 1000);

      const status = manager.getStatus('https://proxy-a.example.com/proxy');
      expect(status?.cooldown).toBe(false);
      expect(status?.failures).toBe(0);
    });
  });

  describe('priority ordering', () => {
    it('proxy with success is preferred over proxy with failures', () => {
      // Record failures on A
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');

      // Record success on B (resets failures)
      manager.recordFailure('https://proxy-b.example.com/proxy');
      manager.recordSuccess('https://proxy-b.example.com/proxy');

      // C has 0 failures, B has 0 failures (reset), A has 3 failures
      // Should pick one with 0 failures (B or C)
      const best = manager.getBestProxy();
      expect(best).not.toBe('https://proxy-a.example.com/proxy');
    });

    it('after success, failure count resets and proxy becomes preferred', () => {
      // Give all proxies some failures
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-a.example.com/proxy');
      manager.recordFailure('https://proxy-b.example.com/proxy');
      manager.recordFailure('https://proxy-c.example.com/proxy');

      // Record success on A — resets its failures to 0
      manager.recordSuccess('https://proxy-a.example.com/proxy');

      const best = manager.getBestProxy();
      expect(best).toBe('https://proxy-a.example.com/proxy');
    });
  });

  describe('default proxies', () => {
    it('uses default public proxies when no custom proxies provided', () => {
      const defaultManager = new ProxyManager();
      const proxies = defaultManager.getProxies();
      expect(proxies.length).toBe(3);
      expect(proxies.every((p) => p.isPublic)).toBe(true);
    });

    it('getBestProxy works with default proxies', () => {
      const defaultManager = new ProxyManager();
      const proxy = defaultManager.getBestProxy();
      expect(proxy).toBeTruthy();
      expect(proxy.startsWith('https://')).toBe(true);
    });
  });

  describe('getProxies', () => {
    it('returns a copy of the proxy list', () => {
      const proxies = manager.getProxies();
      expect(proxies).toHaveLength(3);
      // Modifying the returned array should not affect internal state
      proxies.push({ id: 99, url: 'https://extra.com', isPublic: false });
      expect(manager.getProxies()).toHaveLength(3);
    });
  });

  describe('unknown proxy handling', () => {
    it('recordFailure creates status for unknown proxy', () => {
      manager.recordFailure('https://unknown.example.com/proxy');
      const status = manager.getStatus('https://unknown.example.com/proxy');
      expect(status?.failures).toBe(1);
    });

    it('recordSuccess creates status for unknown proxy', () => {
      manager.recordSuccess('https://unknown.example.com/proxy');
      const status = manager.getStatus('https://unknown.example.com/proxy');
      expect(status?.totalSuccess).toBe(1);
    });
  });
});
