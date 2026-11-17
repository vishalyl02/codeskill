export type StorageType = 'session' | 'local';

export const ACCESS_TOKEN_KEY = 'codeskill_token';
export const REFRESH_TOKEN_KEY = 'codeskill_refresh_token';
export const REMEMBER_ME_KEY = 'codeskill_remember_me';
export const AUTH_CHANGED_EVENT = 'codeskill:auth-changed';

function safeGet(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write errors (e.g. quota exceeded / disabled)
  }
}

function safeRemove(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

function getSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const authStorage = {
  getAccessToken(): string | null {
    const session = getSessionStorage();
    const local = getLocalStorage();
    return safeGet(session, ACCESS_TOKEN_KEY) || safeGet(local, ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    const session = getSessionStorage();
    const local = getLocalStorage();
    return safeGet(session, REFRESH_TOKEN_KEY) || safeGet(local, REFRESH_TOKEN_KEY);
  },

  getActiveStorageType(): StorageType {
    const session = getSessionStorage();
    const local = getLocalStorage();

    const hasSessionToken = Boolean(
      safeGet(session, ACCESS_TOKEN_KEY) || safeGet(session, REFRESH_TOKEN_KEY)
    );
    if (hasSessionToken) {
      return 'session';
    }

    const isRemembered = safeGet(local, REMEMBER_ME_KEY) === 'true';
    if (isRemembered) {
      return 'local';
    }

    return 'session';
  },

  setTokens(accessToken: string, refreshToken?: string, rememberMe?: boolean): void {
    if (typeof window === 'undefined') return;

    const target: StorageType =
      typeof rememberMe === 'boolean'
        ? rememberMe
          ? 'local'
          : 'session'
        : this.getActiveStorageType();

    // Prevent split-storage state across session and local
    this.clearTokens({ dispatchEvent: false });

    const session = getSessionStorage();
    const local = getLocalStorage();
    const engine = target === 'local' ? local : session;

    if (accessToken) {
      safeSet(engine, ACCESS_TOKEN_KEY, accessToken);
    }
    if (refreshToken) {
      safeSet(engine, REFRESH_TOKEN_KEY, refreshToken);
    }
    if (target === 'local') {
      safeSet(local, REMEMBER_ME_KEY, 'true');
    }

    try {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    } catch {
      // Ignore event dispatch failure in non-standard environments
    }
  },

  clearTokens(options: { dispatchEvent?: boolean } = { dispatchEvent: true }): void {
    if (typeof window === 'undefined') return;

    const session = getSessionStorage();
    const local = getLocalStorage();

    safeRemove(session, ACCESS_TOKEN_KEY);
    safeRemove(session, REFRESH_TOKEN_KEY);
    safeRemove(session, REMEMBER_ME_KEY);

    safeRemove(local, ACCESS_TOKEN_KEY);
    safeRemove(local, REFRESH_TOKEN_KEY);
    safeRemove(local, REMEMBER_ME_KEY);

    if (options.dispatchEvent !== false) {
      try {
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      } catch {
        // Ignore
      }
    }
  },
};
