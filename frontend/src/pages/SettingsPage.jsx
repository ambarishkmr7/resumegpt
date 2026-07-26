// User settings: profile management, password change, current plan info,
// payment history, and percent-based usage meters.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client";
import { ensureRazorpay } from "../utils/razorpay";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import UsageMeter from "../components/UsageMeter.jsx";

const TABS = [
  { id: "plan", label: "💳 Plan & Billing" },
  { id: "usage", label: "📊 Usage" },
  { id: "profile", label: "👤 Profile" },
  { id: "account", label: "🔐 Account" },
];

function AutoPayCard({ status, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const on = !!status?.auto_pay;

  const toggle = async (enabled) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await api.setAutoPay(enabled);
      if (res.requires_checkout) {
        // Checkout owns `busy` from here — its handler/ondismiss clears it.
        // Razorpay has no "resume" for a mandate — switching auto-pay back on
        // means authorising a new one. Nothing is charged today: the mandate
        // starts at the end of the period already paid for.
        await ensureRazorpay();
        const rzp = new window.Razorpay({
          key: res.razorpay_key_id,
          subscription_id: res.subscription_id,
          name: "resumesGPT",
          description: `Auto-payment for ${status.plan_name || status.plan}`,
          image: "/logo.png",
          handler: async (resp) => {
            try {
              await api.verifyPayment({
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                razorpay_subscription_id: resp.razorpay_subscription_id || res.subscription_id,
              });
              onChanged?.();
              navigate(`/payment/success/${encodeURIComponent(res.payment_ref)}`);
            } catch (e) {
              setErr("Could not confirm the mandate: " + e.message);
            } finally { setBusy(false); }
          },
          theme: { color: "#d97706" },
          modal: { ondismiss: () => setBusy(false) },
        });
        rzp.open();
        return;
      }
      setMsg(res.message);
      onChanged?.();
      setBusy(false);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  if (!status?.is_subscribed) return null;

  return (
    <div style={{
      padding: "16px 20px", borderRadius: 12, border: "1px solid var(--line)",
      background: "var(--paper-2,#fffdf8)", marginBottom: 24,
    }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            Auto-payment
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999,
              color: on ? "#16a34a" : "#92400e", background: on ? "#dcfce7" : "#fef3c7",
            }}>{on ? "ON" : "OFF"}</span>
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
            {on
              ? `Your plan renews automatically each month. ${
                  status.current_period_end
                    ? `Next charge around ${new Date(status.current_period_end).toLocaleDateString()}.`
                    : ""}`
              : status.auto_pay_available
              ? "Your plan will simply expire at the end of this cycle unless you pay again. Turn auto-payment on to renew without thinking about it."
              : "This plan isn't set up for auto-payment. Renew it manually from the plans screen when it expires."}
          </div>
        </div>
        <button
          className={on ? "btn btn-ghost" : "btn btn-primary"}
          disabled={busy || (!on && !status.auto_pay_available)}
          onClick={() => toggle(!on)}
          style={{ flexShrink: 0 }}
        >
          {busy ? "Working…" : on ? "Turn off auto-payment" : "Turn on auto-payment"}
        </button>
      </div>
      {status.cancel_at_period_end && status.current_period_end && (
        <div style={{ fontSize: 13, color: "#92400e", marginTop: 10 }}>
          Auto-payment is cancelled — your plan stays active until{" "}
          {new Date(status.current_period_end).toLocaleDateString()}.
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: "#16a34a", marginTop: 10 }}>{msg}</div>}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function PlanTab() {
  const [status, setStatus] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return Promise.allSettled([api.subscriptionStatus(), api.paymentHistory()])
      .then(([s, p]) => {
        if (s.status === "fulfilled") setStatus(s.value);
        if (p.status === "fulfilled") setPayments(p.value || []);
      });
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

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
                ` · ${status.auto_pay ? "renews" : "runs until"} ${new Date(status.current_period_end).toLocaleDateString()}`}
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

      <AutoPayCard status={status} onChanged={load} />

      <h3>Payment history</h3>
      {payments.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No payments yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%" }}>
            <thead>
              <tr><th>Date</th><th>Item</th><th>Type</th><th>Amount</th><th>Coupon</th><th>Status</th><th>Invoice</th></tr>
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
                  <td>
                    {p.status === "paid" ? (
                      <Link className="btn btn-ghost btn-sm" to={`/payment/success/${encodeURIComponent(p.id)}`}>
                        View / download
                      </Link>
                    ) : "—"}
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
