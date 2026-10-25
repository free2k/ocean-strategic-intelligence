import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CookieStore, parseCookieString } from '../../server/utils/wechat/cookie-store';
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), 'cookie-store-test-' + process.pid);
const TEST_FILE = join(TEST_DIR, 'cookies.json');

describe('parseCookieString', () => {
  it('parses a simple cookie', () => {
    const result = parseCookieString('session_id=abc123');
    expect(result).toEqual({ name: 'session_id', value: 'abc123' });
  });

  it('parses cookie with domain and path', () => {
    const result = parseCookieString('token=xyz; Domain=.example.com; Path=/api');
    expect(result).toEqual({
      name: 'token',
      value: 'xyz',
      domain: '.example.com',
      path: '/api',
    });
  });

  it('parses cookie with expires', () => {
    const result = parseCookieString('id=1; Expires=Thu, 01 Jan 2026 00:00:00 GMT');
    expect(result.name).toBe('id');
    expect(result.value).toBe('1');
    expect(result.expires).toBe(Date.parse('Thu, 01 Jan 2026 00:00:00 GMT'));
  });

  it('handles cookie value with equals sign', () => {
    const result = parseCookieString('data=base64==encoded');
    expect(result.name).toBe('data');
    expect(result.value).toBe('base64==encoded');
  });

  it('handles empty value', () => {
    const result = parseCookieString('empty=');
    expect(result.name).toBe('empty');
    expect(result.value).toBe('');
  });
});

describe('CookieStore', () => {
  let store: CookieStore;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    store = new CookieStore(TEST_FILE);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('setCookie and getCookie', () => {
    it('stores and retrieves cookies', async () => {
      await store.setCookie('key1', 'token1', ['session=abc; Domain=.wx.qq.com']);
      const result = await store.getCookie('key1');
      expect(result).toBe('session=abc');
    });

    it('returns null for non-existent key', async () => {
      const result = await store.getCookie('nonexistent');
      expect(result).toBeNull();
    });

    it('stores multiple cookies as semicolon-separated string', async () => {
      await store.setCookie('key1', 'token1', [
        'session=abc',
        'user=john',
        'lang=en',
      ]);
      const result = await store.getCookie('key1');
      expect(result).toBe('session=abc; user=john; lang=en');
    });
  });

  describe('getToken', () => {
    it('returns the token for a stored key', async () => {
      await store.setCookie('key1', 'my-token', ['c=v']);
      const token = await store.getToken('key1');
      expect(token).toBe('my-token');
    });

    it('returns null for non-existent key', async () => {
      const token = await store.getToken('missing');
      expect(token).toBeNull();
    });
  });

  describe('removeCookie', () => {
    it('removes a stored cookie', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      store.removeCookie('key1');
      const result = await store.getCookie('key1');
      expect(result).toBeNull();
    });

    it('does not throw when removing non-existent key', () => {
      expect(() => store.removeCookie('missing')).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('returns true for non-existent key', async () => {
      expect(await store.isExpired('missing')).toBe(true);
    });

    it('returns false for freshly stored cookie', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      expect(await store.isExpired('key1')).toBe(false);
    });

    it('returns true for expired cookie', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      // Manually expire the entry
      const entry = (store as any).cache.get('key1');
      entry.expiresAt = Date.now() - 1000;
      expect(await store.isExpired('key1')).toBe(true);
    });
  });

  describe('expiration behavior', () => {
    it('getCookie returns null for expired entries', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      // Manually expire
      const entry = (store as any).cache.get('key1');
      entry.expiresAt = Date.now() - 1;
      const result = await store.getCookie('key1');
      expect(result).toBeNull();
    });

    it('getToken returns null for expired entries', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      const entry = (store as any).cache.get('key1');
      entry.expiresAt = Date.now() - 1;
      const result = await store.getToken('key1');
      expect(result).toBeNull();
    });

    it('expired entries are removed from cache on access', async () => {
      await store.setCookie('key1', 'token1', ['c=v']);
      const entry = (store as any).cache.get('key1');
      entry.expiresAt = Date.now() - 1;
      await store.getCookie('key1');
      expect((store as any).cache.has('key1')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used entry when cache is full', async () => {
      const smallStore = new CookieStore(TEST_FILE);
      (smallStore as any).maxSize = 3;

      await smallStore.setCookie('a', 'ta', ['c=1']);
      await smallStore.setCookie('b', 'tb', ['c=2']);
      await smallStore.setCookie('c', 'tc', ['c=3']);

      // Cache is full, adding 'd' should evict 'a' (least recently used)
      await smallStore.setCookie('d', 'td', ['c=4']);

      expect(await smallStore.getCookie('a')).toBeNull();
      expect(await smallStore.getCookie('b')).toBe('c=2');
      expect(await smallStore.getCookie('c')).toBe('c=3');
      expect(await smallStore.getCookie('d')).toBe('c=4');
    });

    it('accessing an entry moves it to most recently used', async () => {
      const smallStore = new CookieStore(TEST_FILE);
      (smallStore as any).maxSize = 3;

      await smallStore.setCookie('a', 'ta', ['c=1']);
      await smallStore.setCookie('b', 'tb', ['c=2']);
      await smallStore.setCookie('c', 'tc', ['c=3']);

      // Access 'a' to make it most recently used
      await smallStore.getCookie('a');

      // Adding 'd' should now evict 'b' (least recently used)
      await smallStore.setCookie('d', 'td', ['c=4']);

      expect(await smallStore.getCookie('a')).toBe('c=1');
      expect(await smallStore.getCookie('b')).toBeNull();
      expect(await smallStore.getCookie('c')).toBe('c=3');
      expect(await smallStore.getCookie('d')).toBe('c=4');
    });

    it('updating an existing entry does not increase cache size', async () => {
      const smallStore = new CookieStore(TEST_FILE);
      (smallStore as any).maxSize = 3;

      await smallStore.setCookie('a', 'ta', ['c=1']);
      await smallStore.setCookie('b', 'tb', ['c=2']);
      await smallStore.setCookie('c', 'tc', ['c=3']);

      // Update 'a' — should not evict anything
      await smallStore.setCookie('a', 'ta-new', ['c=updated']);

      expect(await smallStore.getCookie('a')).toBe('c=updated');
      expect(await smallStore.getCookie('b')).toBe('c=2');
      expect(await smallStore.getCookie('c')).toBe('c=3');
    });
  });

  describe('file persistence', () => {
    it('persists data to file after setCookie', async () => {
      await store.setCookie('key1', 'token1', ['session=abc']);

      const fileContent = await readFile(TEST_FILE, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.key1).toBeDefined();
      expect(data.key1.token).toBe('token1');
      expect(data.key1.cookies[0].name).toBe('session');
      expect(data.key1.cookies[0].value).toBe('abc');
    });

    it('loads data from file on first access', async () => {
      const now = Date.now();
      const fileData = {
        existing: {
          token: 'file-token',
          cookies: [{ name: 'c', value: 'v' }],
          createdAt: now,
          expiresAt: now + 86400000,
        },
      };
      await writeFile(TEST_FILE, JSON.stringify(fileData), 'utf-8');

      const newStore = new CookieStore(TEST_FILE);
      const result = await newStore.getCookie('existing');
      expect(result).toBe('c=v');
    });

    it('skips expired entries when loading from file', async () => {
      const fileData = {
        expired: {
          token: 'old-token',
          cookies: [{ name: 'c', value: 'v' }],
          createdAt: 1000,
          expiresAt: 2000, // long expired
        },
      };
      await writeFile(TEST_FILE, JSON.stringify(fileData), 'utf-8');

      const newStore = new CookieStore(TEST_FILE);
      const result = await newStore.getCookie('expired');
      expect(result).toBeNull();
    });

    it('falls back to memory-only mode on write failure', async () => {
      // Use a path that will fail (directory doesn't exist and can't be created)
      const badStore = new CookieStore('/proc/nonexistent/cookies.json');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Should not throw
      const result = await badStore.setCookie('key1', 'token1', ['c=v']);
      expect(result).toBe(true);

      // Should still work from memory
      const cookie = await badStore.getCookie('key1');
      expect(cookie).toBe('c=v');

      warnSpy.mockRestore();
    });

    it('handles corrupted JSON file gracefully', async () => {
      await writeFile(TEST_FILE, 'not valid json{{{', 'utf-8');

      const newStore = new CookieStore(TEST_FILE);
      // Should not throw, starts with empty cache
      const result = await newStore.getCookie('anything');
      expect(result).toBeNull();
    });
  });

  describe('cookie TTL', () => {
    it('sets expiresAt to createdAt + 4 days', async () => {
      const before = Date.now();
      await store.setCookie('key1', 'token1', ['c=v']);
      const after = Date.now();

      const entry = (store as any).cache.get('key1');
      const fourDays = 4 * 24 * 60 * 60 * 1000;

      expect(entry.expiresAt).toBeGreaterThanOrEqual(before + fourDays);
      expect(entry.expiresAt).toBeLessThanOrEqual(after + fourDays);
    });
  });
});
