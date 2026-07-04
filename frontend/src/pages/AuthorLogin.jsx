import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { api } from "../api/client";

export default function AuthorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.authorLogin(email, password);
      localStorage.setItem("author_token", res.access_token);
      navigate("/author");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Author sign in</h2>
      <p className="sub">Log in to publish content for the Our Authors section.</p>
      {error && <div className="error">{error}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@resumes-gpt.com" required autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="sub" style={{ marginTop: 16, fontSize: 12.5 }}>
        Authors are added by the team. <Link to="/" style={{ color: "#b45309", fontWeight: 600 }}>Back to site</Link>
      </p>
    </AuthLayout>
  );
}
