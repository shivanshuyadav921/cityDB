import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface AuthUser {
  id: number | string;
  email: string;
  name: string;
  avatar_url?: string | null;
  provider: "local" | "google";
  created_at?: string;
}

export interface GoogleConfig {
  googleConfigured: boolean;
  googleClientId: string | null;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  googleConfig: GoogleConfig;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "citydb_auth_token";
const USER_KEY = "citydb_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>({
    googleConfigured: false,
    googleClientId: null,
  });

  const saveAuth = useCallback((newUser: AuthUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      localStorage.setItem(TOKEN_KEY, newToken);
    } catch {
      // storage quota or private browsing
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = token || localStorage.getItem(TOKEN_KEY);
    if (!currentToken) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      } else if (res.status === 401) {
        // Token expired
        logout();
      }
    } catch {
      // Offline or network error: retain cached user
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  // Load Google auth config
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/auth/config");
        if (res.ok) {
          const cfg = (await res.json()) as GoogleConfig;
          setGoogleConfig(cfg);
        }
      } catch {
        // config endpoint unavailable
      }
    }
    loadConfig();
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to log in.");
      }

      saveAuth(data.user, data.token);
    },
    [saveAuth]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      saveAuth(data.user, data.token);
    },
    [saveAuth]
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Google authentication failed.");
      }

      saveAuth(data.user, data.token);
    },
    [saveAuth]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        googleConfig,
        login,
        register,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
