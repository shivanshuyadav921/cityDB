import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const { user, login, register, loginWithGoogle, googleConfig } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleInfoOpen, setGoogleInfoOpen] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setGoogleInfoOpen(false);
    }
  }, [isOpen]);

  // Load Google Identity Services script if configured
  useEffect(() => {
    if (!isOpen || !googleConfig.googleConfigured || !googleConfig.googleClientId) return;

    const scriptId = "google-jssdk";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleBtn;
      document.body.appendChild(script);
    } else {
      initializeGoogleBtn();
    }

    function initializeGoogleBtn() {
      const google = (window as unknown as { google?: { accounts: { id: { initialize: (cfg: unknown) => void; renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google;
      if (!google || !googleBtnRef.current || !googleConfig.googleClientId) return;

      google.accounts.id.initialize({
        client_id: googleConfig.googleClientId,
        callback: async (response: { credential?: string }) => {
          if (response.credential) {
            setLoading(true);
            try {
              await loginWithGoogle(response.credential);
              onSuccess?.("Signed in successfully with Google!");
              onClose();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setLoading(false);
            }
          }
        },
      });

      google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_blue",
        size: "large",
        shape: "rectangular",
        width: 300,
        text: "continue_with",
      });
    }
  }, [isOpen, googleConfig, loginWithGoogle, onClose, onSuccess]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
        onSuccess?.("Welcome back! Signed in successfully.");
      } else {
        await register(email, password, name);
        onSuccess?.("Account created successfully! You are now signed in.");
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin() {
    setEmail("demo@citydb.io");
    setPassword("citydb123");
    setName("Demo Engineer");
    if (mode === "register") {
      setMode("login");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 5, 12, 0.8)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#080c18",
          border: "1px solid #1a2340",
          borderRadius: 12,
          padding: 24,
          color: "#e8ecff",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#ffe14d", fontWeight: 700 }}>
              {mode === "login" ? "Sign In to CityDB" : "Create CityDB Account"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5a6a8f" }}>
              {mode === "login"
                ? "Access saved queries, query history, and collaborative plan analysis."
                : "Join CityDB to inspect PostgreSQL query plans in 3D."}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#5a6a8f",
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: "flex",
            background: "#05070d",
            borderRadius: 6,
            padding: 3,
            marginBottom: 16,
            border: "1px solid #111a30",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "7px 0",
              background: mode === "login" ? "#1a2340" : "transparent",
              color: mode === "login" ? "#ffe14d" : "#5a6a8f",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "7px 0",
              background: mode === "register" ? "#1a2340" : "transparent",
              color: mode === "register" ? "#ffe14d" : "#5a6a8f",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Register
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "#3a0a14",
              border: "1px solid #7a1a2a",
              color: "#ff5a6e",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#8fa0cc", marginBottom: 4 }}>
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#8fa0cc", marginBottom: 4 }}>
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#8fa0cc", marginBottom: 4 }}>
              Password {mode === "register" && "(min 6 characters)"}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: "#ffe14d",
              color: "#05070d",
              border: "none",
              borderRadius: 6,
              padding: "10px 0",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              transition: "opacity 0.15s",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Processing…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "18px 0 14px",
            color: "#3d4a70",
            fontSize: 11,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#111a30" }} />
          <span style={{ padding: "0 10px" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "#111a30" }} />
        </div>

        {/* Google OAuth Section */}
        {googleConfig.googleConfigured && googleConfig.googleClientId ? (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <div ref={googleBtnRef} />
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setGoogleInfoOpen((prev) => !prev)}
              style={{
                width: "100%",
                background: "#0f162b",
                border: "1px solid #1a2340",
                borderRadius: 6,
                padding: "9px 12px",
                color: "#e8ecff",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign in with Google
            </button>

            {googleInfoOpen && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#05070d",
                  border: "1px dashed #2a3a60",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#8fa0cc",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: "#ffe14d", fontWeight: 600, marginBottom: 4 }}>
                  ⚙️ Google OAuth Setup Required
                </div>
                To enable Google sign-in:
                <ol style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  <li>Create an OAuth 2.0 Client ID in Google Cloud Console.</li>
                  <li>Set authorized origin to your Vercel URL or localhost.</li>
                  <li>Set <code style={{ color: "#ffe14d" }}>GOOGLE_CLIENT_ID</code> in Vercel Environment Variables.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Demo Fast Login */}
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button
            type="button"
            onClick={handleDemoLogin}
            style={{
              background: "transparent",
              border: "none",
              color: "#8fb0ff",
              fontSize: 11,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Fill Demo Credentials
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#05070d",
  border: "1px solid #1a2340",
  borderRadius: 6,
  padding: "9px 12px",
  color: "#e8ecff",
  fontSize: 12,
  outline: "none",
};
