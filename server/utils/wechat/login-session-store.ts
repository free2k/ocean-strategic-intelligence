/**
 * Temporary in-memory store for login session cookies.
 *
 * During the QR code login flow, we need to keep the session cookies
 * between the initial QR code request and the subsequent polling/login
 * completion steps. This store holds those cookies keyed by a sessionId
 * that is returned to the client.
 *
 * Sessions are automatically cleaned up after 5 minutes (login timeout).
 */

interface LoginSession {
  cookies: string;
  createdAt: number;
}

/** Session timeout: 5 minutes */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

const sessions = new Map<string, LoginSession>();

/** Cleanup interval: runs every 60 seconds */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions.entries()) {
      if (now - session.createdAt > SESSION_TIMEOUT_MS) {
        sessions.delete(key);
      }
    }
    // Stop interval if no sessions remain
    if (sessions.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 60_000);
}

/**
 * Store a login session's cookies.
 */
function setLoginSession(sessionId: string, cookies: string): void {
  sessions.set(sessionId, {
    cookies,
    createdAt: Date.now(),
  });
  startCleanup();
}

/**
 * Retrieve cookies for a login session.
 * Returns null if the session doesn't exist or has expired.
 */
function getLoginSession(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    sessions.delete(sessionId);
    return null;
  }

  return session.cookies;
}

/**
 * Remove a login session (e.g., after login is complete).
 */
function removeLoginSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function useLoginSessionStore() {
  return {
    setLoginSession,
    getLoginSession,
    removeLoginSession,
  };
}
