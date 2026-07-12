// User settings: profile management, password change, current plan info,
// payment history, and percent-based usage meters.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import UsageMeter from "../components/UsageMeter.jsx";

const TABS = [
  { id: "plan", label: "💳 Plan & Billing" },
  { id: "usage", label: "📊 Usage" },
  { id: "profile", label: "👤 Profile" },
  { id: "account", label: "🔐 Account" },
];

function PlanTab() {
  const [status, setStatus] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([api.subscriptionStatus(), api.paymentHistory()])
      .then(([s, p]) => {
        if (s.status === "fulfilled") setStatus(s.value);
        if (p.status === "fulfilled") setPayments(p.value || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--ink-soft)" }}>Loading…</p>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Current plan</h3>
      <div style={{
        padding: "16px 20px", borderRadius: 12, border: "1px solid var(--line)",
        background: "var(--paper-2,#fffdf8)", marginBottom: 24,
      }}>
        {status?.is_subscribed ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {status.plan_name || status.plan}
              <span style={{
                marginLeft: 10, fontSize: 12, fontWeight: 700, color: "#16a34a",
                background: "#dcfce7", padding: "2px 10px", borderRadius: 999,
              }}>ACTIVE</span>
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
              ₹{(status.amount || 0).toLocaleString("en-IN")} / month
              {status.current_period_end &&
                ` · renews ${new Date(status.current_period_end).toLocaleDateString()}`}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Free plan</div>
            <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
              {status?.used_freepass
                ? "You have complimentary access."
                : "Subscribe to unlock monthly mock-interview minutes and AI usage."}
            </div>
          </>
        )}
      </div>

      <h3>Payment history</h3>
      {payments.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No payments yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%" }}>
            <thead>
              <tr><th>Date</th><th>Item</th><th>Type</th><th>Amount</th><th>Coupon</th><th>Status</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                  <td>{p.plan}</td>
                  <td>{p.type}</td>
                  <td>₹{(p.amount || 0).toLocaleString("en-IN")}
                    {p.discount_inr ? <span style={{ color: "#16a34a", fontSize: 12 }}> (−₹{p.discount_inr})</span> : null}
                  </td>
                  <td>{p.coupon_code || "—"}</td>
                  <td>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      color: p.status === "paid" ? "#16a34a" : p.status === "failed" ? "#dc2626" : "#92400e",
                      background: p.status === "paid" ? "#dcfce7" : p.status === "failed" ? "#fee2e2" : "#fef3c7",
                    }}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UsageTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Your usage this month</h3>
      <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
        Usage is shown as a percentage of your monthly allowance — interview minutes,
        overall AI usage (including chat), and today's resume uploads.
      </p>
      <UsageMeter />
    </div>
  );
}

function ProfileTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pct, setPct] = useState(null);

  useEffect(() => {
    api.getProfile().then((p) => setPct(p.profile_completion ?? 0)).catch(() => {});
  }, []);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Profile management</h3>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        padding: "16px 20px", borderRadius: 12, border: "1px solid var(--line)",
        background: "var(--paper-2,#fffdf8)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "var(--accent-soft,#fde68a)",
          display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800, color: "var(--accent,#b45309)",
        }}>
          {(user?.full_name || user?.email || "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>{user?.full_name || "—"}</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{user?.email}</div>
          {pct !== null && (
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
              Profile {pct}% complete
            </div>
          )}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate("/profile")}>
          Edit full profile →
        </button>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 12 }}>
        Manage your personal details, education, experience, skills, career preferences
        and profile photo from the full profile editor.
      </p>
    </div>
  );
}

function AccountTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (next.length < 8) { setMsg("❌ New password must be at least 8 characters."); return; }
    if (next !== confirm) { setMsg("❌ New passwords don't match."); return; }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setMsg("✅ Password changed successfully.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Change password</h3>
      <form onSubmit={submit} style={{ maxWidth: 400 }}>
        <div className="field">
          <label>Current password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="field">
          <label>New password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>
        {msg && <div style={{ fontSize: 14, margin: "8px 0" }}>{msg}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("plan");

  return (
    <>
      <Topbar />
      <div className="container" style={{ maxWidth: 900 }}>
        <div style={{ margin: "8px 0 12px" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        </div>
        <h2 style={{ margin: "0 0 16px", fontSize: 28 }}>⚙️ Settings</h2>

        <div className="admin-tabs" style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.id} className={`rtab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ minHeight: 320, marginBottom: 40 }}>
          {tab === "plan" && <PlanTab />}
          {tab === "usage" && <UsageTab />}
          {tab === "profile" && <ProfileTab />}
          {tab === "account" && <AccountTab />}
        </div>
      </div>
      <Footer />
    </>
  );
}
