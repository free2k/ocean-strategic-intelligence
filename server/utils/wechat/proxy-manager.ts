/**
 * ProxyManager manages proxy nodes for WeChat article downloads.
 * Handles node selection (fewest failures first), cooldown after consecutive
 * failures, and automatic reset when all proxies are unavailable.
 */

/** Maximum consecutive failures before a proxy enters cooldown */
const MAX_FAILURES = 5;

/** Cooldown duration in milliseconds (60 seconds) */
const COOLDOWN_MS = 60 * 1000;

export interface ProxyNode {
  id: number;
  url: string;
  name?: string;
  authorization?: string;
  isPublic: boolean;
}

export interface ProxyStatus {
  failures: number;
  lastUsed: number;
  cooldown: boolean;
  totalFailures: number;
  totalSuccess: number;
}

/** Default public proxy nodes */
const DEFAULT_PUBLIC_PROXIES: ProxyNode[] = [
  { id: -1, url: 'https://proxy1.example.com/proxy', name: 'Public Proxy 1', isPublic: true },
  { id: -2, url: 'https://proxy2.example.com/proxy', name: 'Public Proxy 2', isPublic: true },
  { id: -3, url: 'https://proxy3.example.com/proxy', name: 'Public Proxy 3', isPublic: true },
];

export class ProxyManager {
  private proxies: ProxyNode[];
  private proxyStatus: Map<string, ProxyStatus>;
  private cooldownTimers: Map<string, ReturnType<typeof setTimeout>>;

  constructor(initialProxies?: ProxyNode[]) {
    this.proxies = initialProxies ?? [...DEFAULT_PUBLIC_PROXIES];
    this.proxyStatus = new Map();
    this.cooldownTimers = new Map();

    // Initialize status for all proxies
    for (const proxy of this.proxies) {
      this.ensureStatus(proxy.url);
    }
  }

  /**
   * Get the best available proxy URL.
   * Selection strategy: filter out proxies in cooldown, then pick the one
   * with the fewest failures. If all proxies are in cooldown, reset the
   * one with the earliest lastUsed timestamp.
   */
  getBestProxy(): string {
    // Filter available proxies (not in cooldown)
    const available = this.proxies.filter((p) => {
      const status = this.proxyStatus.get(p.url);
      return !status || !status.cooldown;
    });

    if (available.length > 0) {
      // Sort by failures ascending, pick the one with fewest failures
      available.sort((a, b) => {
        const statusA = this.proxyStatus.get(a.url);
        const statusB = this.proxyStatus.get(b.url);
        const failuresA = statusA?.failures ?? 0;
        const failuresB = statusB?.failures ?? 0;
        return failuresA - failuresB;
      });

      const best = available[0];
      const status = this.ensureStatus(best.url);
      status.lastUsed = Date.now();
      return best.url;
    }

    // All proxies are in cooldown — reset the one with earliest lastUsed
    return this.resetEarliestProxy();
  }

  /**
   * Record a failure for the given proxy URL.
   * If failures reach MAX_FAILURES, the proxy enters a 60-second cooldown.
   */
  recordFailure(proxy: string): void {
    const status = this.ensureStatus(proxy);
    status.failures += 1;
    status.totalFailures += 1;
    status.lastUsed = Date.now();

    if (status.failures >= MAX_FAILURES) {
      status.cooldown = true;

      // Clear any existing timer for this proxy
      const existingTimer = this.cooldownTimers.get(proxy);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule cooldown reset after COOLDOWN_MS
      const timer = setTimeout(() => {
        status.cooldown = false;
        status.failures = 0;
        this.cooldownTimers.delete(proxy);
      }, COOLDOWN_MS);

      // Unref the timer so it doesn't prevent process exit
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }

      this.cooldownTimers.set(proxy, timer);
    }
  }

  /**
   * Record a success for the given proxy URL.
   * Resets failure count and removes cooldown.
   */
  recordSuccess(proxy: string): void {
    const status = this.ensureStatus(proxy);
    status.failures = 0;
    status.cooldown = false;
    status.totalSuccess += 1;
    status.lastUsed = Date.now();

    // Clear cooldown timer if one exists
    const existingTimer = this.cooldownTimers.get(proxy);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.cooldownTimers.delete(proxy);
    }
  }

  /**
   * Load proxy nodes from the database and merge with existing proxies.
   * Replaces non-public (custom) proxies with database entries while
   * keeping the default public proxies.
   */
  async loadFromDatabase(): Promise<void> {
    try {
      const { db } = await import('../../db');
      const { proxyNodes } = await import('../../db/schema');
      const { eq } = await import('drizzle-orm');

      const dbProxies = await db.select().from(proxyNodes).where(eq(proxyNodes.enabled, true));

      // Keep public defaults, replace custom proxies with DB entries
      const publicProxies = this.proxies.filter((p) => p.isPublic);
      const customProxies: ProxyNode[] = dbProxies.map((row) => ({
        id: row.id,
        url: row.url,
        name: row.name ?? undefined,
        authorization: row.authorization ?? undefined,
        isPublic: row.isPublic,
      }));

      this.proxies = [...publicProxies, ...customProxies];

      // Initialize status for any new proxies
      for (const proxy of this.proxies) {
        this.ensureStatus(proxy.url);
      }
    } catch (err) {
      console.warn('[ProxyManager] Failed to load proxies from database:', err);
    }
  }

  /**
   * Get the current list of proxy nodes.
   */
  getProxies(): ProxyNode[] {
    return [...this.proxies];
  }

  /**
   * Get the status of a specific proxy.
   */
  getStatus(proxy: string): ProxyStatus | undefined {
    return this.proxyStatus.get(proxy);
  }

  /**
   * Ensure a ProxyStatus entry exists for the given URL.
   */
  private ensureStatus(url: string): ProxyStatus {
    let status = this.proxyStatus.get(url);
    if (!status) {
      status = {
        failures: 0,
        lastUsed: 0,
        cooldown: false,
        totalFailures: 0,
        totalSuccess: 0,
      };
      this.proxyStatus.set(url, status);
    }
    return status;
  }

  /**
   * Reset the proxy with the earliest lastUsed timestamp and return its URL.
   * Called when all proxies are in cooldown.
   */
  private resetEarliestProxy(): string {
    let earliestUrl = this.proxies[0].url;
    let earliestTime = Infinity;

    for (const proxy of this.proxies) {
      const status = this.proxyStatus.get(proxy.url);
      const lastUsed = status?.lastUsed ?? 0;
      if (lastUsed < earliestTime) {
        earliestTime = lastUsed;
        earliestUrl = proxy.url;
      }
    }

    // Reset the earliest proxy
    const status = this.ensureStatus(earliestUrl);
    status.cooldown = false;
    status.failures = 0;
    status.lastUsed = Date.now();

    // Clear its cooldown timer
    const timer = this.cooldownTimers.get(earliestUrl);
    if (timer) {
      clearTimeout(timer);
      this.cooldownTimers.delete(earliestUrl);
    }

    return earliestUrl;
  }
}

/** Singleton instance for use across the application */
export const proxyManager = new ProxyManager();
