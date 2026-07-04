import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { resolvePendingAction } from "../utils/pendingAction.js";

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  document.querySelector('meta[name="google-client-id"]')?.content ||
  "";

export default function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleBtn = useRef(null);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await login(email, password); await resolvePendingAction(navigate); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setBusy(true); setError("");
          try { await googleLogin(response.credential); await resolvePendingAction(navigate); }
          catch (err) { setError(err.message); }
          finally { setBusy(false); }
        },
      });
      if (googleBtn.current) {
        window.google.accounts.id.renderButton(googleBtn.current, {
          theme: "outline", size: "large", width: "100%", text: "signin_with",
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, []);

  return (
    <AuthLayout>
      <Link to="/" aria-label="Go to homepage" style={{ display: "inline-block", marginBottom: 14 }}>
        <img
          src="/logo-wordmark.png"
          alt="resumesGPT — go to homepage"
          style={{ height: 46, width: "auto", display: "block", borderRadius: 8, cursor: "pointer" }}
        />
      </Link>
      <h2>Welcome back</h2>
      <h3>To avail Elite plan benefits you must be logged in...</h3>
      <p className="sub">Sign in to keep building.</p>
      {error && <div className="error">{error}</div>}

      {GOOGLE_CLIENT_ID ? (
        <div ref={googleBtn} style={{ marginBottom: 10, minHeight: 44 }} />
      ) : (
        <button className="btn btn-google" disabled type="button"
          title="Set VITE_GOOGLE_CLIENT_ID in frontend/.env to enable">
          <GoogleIcon /> Sign in with Google (not configured)
        </button>
      )}

      <div className="divider"><span>or sign in with email</span></div>

      <form onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="muted-row">
        <Link to="/forgot-password">Forgot password?</Link>
        <span>New here? <Link to="/register">Create account</Link></span>
      </div>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
