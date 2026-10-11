import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CookieEntity } from '../../db/schema';

/** 4 days in milliseconds */
const COOKIE_TTL_MS = 4 * 24 * 60 * 60 * 1000;

/** Internal structure for a cached account cookie entry */
export interface AccountCookie {
  token: string;
  cookies: CookieEntity[];
  nickname?: string;
  avatar?: string;
  createdAt: number;
  expiresAt: number;
}

/** JSON file storage format */
interface CookieFileFormat {
  [authKey: string]: AccountCookie;
}

/**
 * CookieStore manages WeChat login cookies with an in-memory LRU cache
 * backed by JSON file persistence. Falls back to memory-only mode if
 * file I/O fails.
 */
export class CookieStore {
  private cache: Map<string, AccountCookie> = new Map();
  private readonly maxSize: number = 1000;
  private readonly storagePath: string;
  private loaded: boolean = false;
  private memoryOnly: boolean = false;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? join(process.cwd(), '.data', 'wechat-cookies.json');
  }

  /**
   * Get cookie string for the given authKey.
   * Returns a formatted cookie string like "name1=value1; name2=value2"
   * or null if not found / expired.
   */
  async getCookie(authKey: string): Promise<string | null> {
    await this.ensureLoaded();

    const entry = this.cache.get(authKey);
    if (!entry) {
      return null;
    }

    if (await this.isExpired(authKey)) {
      this.removeCookie(authKey);
      return null;
    }

    // LRU: move to end (most recently used)
    this.cache.delete(authKey);
    this.cache.set(authKey, entry);

    return entry.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  /**
   * Store cookies for the given authKey.
   * Parses raw Set-Cookie header strings into CookieEntity objects.
   */
  async setCookie(authKey: string, token: string, cookies: string[], userInfo?: { nickname?: string; avatar?: string }): Promise<boolean> {
    await this.ensureLoaded();

    // Evict LRU entry if cache is full
    if (!this.cache.has(authKey) && this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const now = Date.now();

    // Parse all cookies and deduplicate by name (later entries win)
    const parsedCookies = cookies.map(parseCookieString);
    const cookieMap = new Map<string, CookieEntity>();
    for (const cookie of parsedCookies) {
      if (cookie.name && cookie.value && cookie.value !== 'EXPIRED') {
        cookieMap.set(cookie.name, cookie);
      }
    }

    const entry: AccountCookie = {
      token,
      cookies: Array.from(cookieMap.values()),
      nickname: userInfo?.nickname,
      avatar: userInfo?.avatar,
      createdAt: now,
      expiresAt: now + COOKIE_TTL_MS,
    };

    // If entry already exists, delete first to move to end (LRU)
    this.cache.delete(authKey);
    this.cache.set(authKey, entry);

    await this.persist();
    return true;
  }

  /**
   * Get the token for the given authKey, or null if not found / expired.
   */
  async getToken(authKey: string): Promise<string | null> {
    await this.ensureLoaded();

    const entry = this.cache.get(authKey);
    if (!entry) {
      return null;
    }

    if (await this.isExpired(authKey)) {
      this.removeCookie(authKey);
      return null;
    }

    // LRU: move to end
    this.cache.delete(authKey);
    this.cache.set(authKey, entry);

    return entry.token;
  }

  /**
   * Remove cookie entry for the given authKey.
   */
  removeCookie(authKey: string): void {
    this.cache.delete(authKey);
    // Fire-and-forget persist (don't await in sync method)
    this.persist().catch(() => {});
  }

  /**
   * Update the nickname and avatar for an existing authKey entry.
   */
  async updateUserInfo(authKey: string, nickname?: string, avatar?: string): Promise<void> {
    await this.ensureLoaded();
    const entry = this.cache.get(authKey);
    if (!entry) return;

    entry.nickname = nickname;
    entry.avatar = avatar;

    // LRU: move to end
    this.cache.delete(authKey);
    this.cache.set(authKey, entry);

    await this.persist();
  }

  /**
   * Get stored user info (nickname, avatar) for the given authKey.
   */
  async getUserInfo(authKey: string): Promise<{ nickname?: string; avatar?: string } | null> {
    await this.ensureLoaded();
    const entry = this.cache.get(authKey);
    if (!entry || Date.now() >= entry.expiresAt) return null;
    return { nickname: entry.nickname, avatar: entry.avatar };
  }

  /**
   * Check if the cookie for the given authKey is expired.
   * Returns true if expired or not found.
   * Ensures data is loaded from file before checking.
   */
  async isExpired(authKey: string): Promise<boolean> {
    await this.ensureLoaded();

    const entry = this.cache.get(authKey);
    if (!entry) {
      return true;
    }
    return Date.now() >= entry.expiresAt;
  }

  /**
   * Load data from file on first access.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;

    try {
      const data = await readFile(this.storagePath, 'utf-8');
      const parsed: CookieFileFormat = JSON.parse(data);

      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        // Skip expired entries during load
        if (now >= entry.expiresAt) {
          continue;
        }
        this.cache.set(key, entry);
      }
    } catch {
      // File doesn't exist or is unreadable — start with empty cache
      // If it's a parse error or permission issue, switch to memory-only
      this.memoryOnly = false; // Will be set to true on first write failure
    }
  }

  /**
   * Persist current cache to JSON file.
   * On failure, switches to memory-only mode and logs a warning.
   */
  private async persist(): Promise<void> {
    if (this.memoryOnly) {
      return;
    }

    try {
      const data: CookieFileFormat = {};
      for (const [key, entry] of this.cache.entries()) {
        data[key] = entry;
      }

      await mkdir(dirname(this.storagePath), { recursive: true });
      await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[CookieStore] File write failed, falling back to memory-only mode:', err);
      this.memoryOnly = true;
    }
  }
}

/**
 * Parse a raw Set-Cookie header string into a CookieEntity.
 * Example input: "session_id=abc123; Domain=.example.com; Path=/; Expires=Thu, 01 Jan 2026 00:00:00 GMT"
 */
export function parseCookieString(raw: string): CookieEntity {
  const parts = raw.split(';').map((p) => p.trim());
  const [nameValue, ...attributes] = parts;

  const eqIndex = nameValue.indexOf('=');
  const name = eqIndex > -1 ? nameValue.slice(0, eqIndex).trim() : nameValue.trim();
  const value = eqIndex > -1 ? nameValue.slice(eqIndex + 1).trim() : '';

  const entity: CookieEntity = { name, value };

  for (const attr of attributes) {
    const attrEqIndex = attr.indexOf('=');
    const attrName = (attrEqIndex > -1 ? attr.slice(0, attrEqIndex) : attr).trim().toLowerCase();
    const attrValue = attrEqIndex > -1 ? attr.slice(attrEqIndex + 1).trim() : '';

    switch (attrName) {
      case 'domain':
        entity.domain = attrValue;
        break;
      case 'path':
        entity.path = attrValue;
        break;
      case 'expires': {
        const ts = Date.parse(attrValue);
        if (!isNaN(ts)) {
          entity.expires = ts;
        }
        break;
      }
    }
  }

  return entity;
}

/** Singleton instance for use across the application */
export const cookieStore = new CookieStore();
