import {
  authStorage,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  REMEMBER_ME_KEY,
  AUTH_CHANGED_EVENT,
} from "@/lib/auth-storage";

describe("authStorage Adapter", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe("setTokens() & storage isolation", () => {
    it("writes exclusively to sessionStorage and cleans localStorage when rememberMe is false", () => {
      // Pre-seed localStorage with stale data to verify cleanup
      localStorage.setItem(ACCESS_TOKEN_KEY, "stale-local-token");
      localStorage.setItem(REFRESH_TOKEN_KEY, "stale-local-refresh");
      localStorage.setItem(REMEMBER_ME_KEY, "true");

      authStorage.setTokens("session-access-123", "session-refresh-456", false);

      // Verify sessionStorage contains new tokens
      expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe("session-access-123");
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe("session-refresh-456");

      // Verify localStorage was completely purged of auth state
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBeNull();

      expect(authStorage.getActiveStorageType()).toBe("session");
      expect(authStorage.getAccessToken()).toBe("session-access-123");
      expect(authStorage.getRefreshToken()).toBe("session-refresh-456");
    });

    it("writes exclusively to localStorage and cleans sessionStorage when rememberMe is true", () => {
      // Pre-seed sessionStorage with stale data
      sessionStorage.setItem(ACCESS_TOKEN_KEY, "stale-session-token");
      sessionStorage.setItem(REFRESH_TOKEN_KEY, "stale-session-refresh");

      authStorage.setTokens("local-access-789", "local-refresh-012", true);

      // Verify localStorage contains tokens and rememberMe flag
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("local-access-789");
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("local-refresh-012");
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe("true");

      // Verify sessionStorage was completely purged
      expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();

      expect(authStorage.getActiveStorageType()).toBe("local");
      expect(authStorage.getAccessToken()).toBe("local-access-789");
      expect(authStorage.getRefreshToken()).toBe("local-refresh-012");
    });

    it("dispatches AUTH_CHANGED_EVENT when tokens are set", () => {
      const listener = jest.fn();
      window.addEventListener(AUTH_CHANGED_EVENT, listener);

      authStorage.setTokens("token-1", "refresh-1", false);

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    });
  });

  describe("Token Rotation (rememberMe undefined)", () => {
    it("preserves sessionStorage during token rotation even if access token was consumed prior to refresh", () => {
      // User is in a lab session (sessionStorage), but access token was cleared/expired
      sessionStorage.setItem(REFRESH_TOKEN_KEY, "active-session-refresh");
      localStorage.clear();

      expect(authStorage.getActiveStorageType()).toBe("session");

      // Rotate tokens without passing rememberMe flag
      authStorage.setTokens("rotated-access-token", "rotated-refresh-token");

      expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe("rotated-access-token");
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe("rotated-refresh-token");
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(authStorage.getActiveStorageType()).toBe("session");
    });

    it("preserves localStorage during token rotation when codeskill_remember_me is true", () => {
      localStorage.setItem(REFRESH_TOKEN_KEY, "persistent-refresh-token");
      localStorage.setItem(REMEMBER_ME_KEY, "true");
      sessionStorage.clear();

      expect(authStorage.getActiveStorageType()).toBe("local");

      // Rotate tokens without passing rememberMe flag
      authStorage.setTokens("rotated-access-token-2", "rotated-refresh-token-2");

      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("rotated-access-token-2");
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("rotated-refresh-token-2");
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe("true");
      expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(authStorage.getActiveStorageType()).toBe("local");
    });
  });

  describe("clearTokens()", () => {
    it("wipes all auth tokens and flags from both sessionStorage and localStorage", () => {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, "s-tok");
      sessionStorage.setItem(REFRESH_TOKEN_KEY, "s-ref");
      localStorage.setItem(ACCESS_TOKEN_KEY, "l-tok");
      localStorage.setItem(REFRESH_TOKEN_KEY, "l-ref");
      localStorage.setItem(REMEMBER_ME_KEY, "true");

      const listener = jest.fn();
      window.addEventListener(AUTH_CHANGED_EVENT, listener);

      authStorage.clearTokens();

      expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBeNull();

      expect(authStorage.getAccessToken()).toBeNull();
      expect(authStorage.getRefreshToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    });
  });
});
