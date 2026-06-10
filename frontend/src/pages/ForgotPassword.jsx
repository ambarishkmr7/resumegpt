import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import AuthLayout from "../components/AuthLayout.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [devLink, setDevLink] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setDevLink("");
    try {
      const res = await api.forgotPassword(email);
      setMsg(res.detail);
      // In dev the backend returns a usable link; in prod it goes by email.
      if (res.dev_reset_link) setDevLink(res.dev_reset_link);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Reset your password</h2>
      <p className="sub">We'll send a reset link to your email.</p>
      {msg && <div className="notice">{msg}</div>}
      {devLink && (
        <div className="notice">
          Dev link: <Link to={devLink.replace(/^.*(\/reset-password.*)$/, "$1")}>open reset page</Link>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <div className="muted-row">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
