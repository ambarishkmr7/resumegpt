import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { api } from "../api/client";

const seg = (active) => ({
  flex: 1,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid " + (active ? "#d97706" : "#e2dccf"),
  background: active ? "#d97706" : "#fff",
  color: active ? "#fff" : "#6b6258",
  cursor: "pointer",
});

export default function SysAdmin() {
  const navigate = useNavigate();
  const [role, setRole] = useState("admin");   // "admin" | "author"
  const [mode, setMode] = useState("login");   // "login" | "register"
  const [f, setF] = useState({
    email: "", password: "", full_name: "", name: "",
    title: "", bio: "", credentials: "", signup_code: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (role === "admin" && mode === "login") {
        const res = await api.adminLoginJson(f.email, f.password);
        if (!res.user || !res.user.is_admin) throw new Error("This is not an admin account.");
        localStorage.setItem("token", res.access_token);
        navigate("/admin");
      } else if (role === "admin" && mode === "register") {
        const res = await api.adminRegister({
          email: f.email, password: f.password, full_name: f.full_name,
          signup_code: f.signup_code || undefined,
        });
        localStorage.setItem("token", res.access_token);
        navigate("/admin");
      } else if (role === "author" && mode === "login") {
        const res = await api.authorLogin(f.email, f.password);
        localStorage.setItem("author_token", res.access_token);
        navigate("/author");
      } else {
        const res = await api.authorRegister({
          name: f.name, email: f.email, password: f.password,
          role: f.title || undefined, bio: f.bio || undefined,
          credentials: f.credentials || undefined,
          signup_code: f.signup_code || undefined,
        });
        localStorage.setItem("author_token", res.access_token);
        navigate("/author");
      }
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = role === "admin";
  const isRegister = mode === "register";

  return (
    <AuthLayout>
      <h2>Staff Console</h2>
      <p className="sub">Sign in or register as an admin or author.</p>

      {/* Role selector */}
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
        <button type="button" style={{ ...seg(isAdmin), borderRadius: "8px 0 0 8px" }} onClick={() => setRole("admin")}>Admin</button>
        <button type="button" style={{ ...seg(!isAdmin), borderRadius: "0 8px 8px 0", borderLeft: "none" }} onClick={() => setRole("author")}>Author</button>
      </div>
      {/* Mode selector */}
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        <button type="button" style={{ ...seg(!isRegister), borderRadius: "8px 0 0 8px" }} onClick={() => setMode("login")}>Sign in</button>
        <button type="button" style={{ ...seg(isRegister), borderRadius: "0 8px 8px 0", borderLeft: "none" }} onClick={() => setMode("register")}>Register</button>
      </div>

      <div style={{ fontSize: 12, color: "#8a7e6b", marginBottom: 12 }}>
        {isAdmin
          ? "Admin accounts are stored in the users table."
          : "Author accounts are stored in the authors table and appear in “Our Authors”."}
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={submit}>
        {/* Author register: name + title + credentials + bio */}
        {!isAdmin && isRegister && (
          <div className="field">
            <label>Display name</label>
            <input value={f.name} onChange={set("name")} placeholder="Ananya Iyer" required />
          </div>
        )}
        {isAdmin && isRegister && (
          <div className="field">
            <label>Full name</label>
            <input value={f.full_name} onChange={set("full_name")} placeholder="Admin name" />
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" value={f.email} onChange={set("email")} placeholder="you@resumes-gpt.com" required autoComplete="username" />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" value={f.password} onChange={set("password")} placeholder="••••••••" required
            autoComplete={isRegister ? "new-password" : "current-password"} />
        </div>

        {!isAdmin && isRegister && (
          <>
            <div className="field">
              <label>Role / title</label>
              <input value={f.title} onChange={set("title")} placeholder="Lead Career Editor · CPRW" />
            </div>
            <div className="field">
              <label>Credentials (badge)</label>
              <input value={f.credentials} onChange={set("credentials")} placeholder="CPRW · 9 yrs" />
            </div>
            <div className="field">
              <label>Short bio</label>
              <textarea value={f.bio} onChange={set("bio")} rows={3} placeholder="One or two sentences about you." />
            </div>
          </>
        )}

        {isRegister && (
          <div className="field">
            <label>Signup code {isAdmin ? "" : "(if required)"}</label>
            <input value={f.signup_code} onChange={set("signup_code")} placeholder="Provided by your team" />
          </div>
        )}

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy} type="submit">
          {busy ? "Please wait…" : isRegister
            ? (isAdmin ? "Create admin account" : "Create author account")
            : (isAdmin ? "Sign in as admin" : "Sign in as author")}
        </button>
      </form>

      <p className="sub" style={{ marginTop: 16, fontSize: 12.5 }}>
        <Link to="/" style={{ color: "#b45309", fontWeight: 600 }}>← Back to site</Link>
      </p>
    </AuthLayout>
  );
}
