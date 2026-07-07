import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SkeletonBlock, SkeletonLine, SkeletonTableRow } from "../components/Skeleton.jsx";
import Markdown from "../components/Markdown.jsx";

function AdminSkeleton() {
  return (
    <div className="container admin-container">
        <SkeletonBlock width={220} height={36} borderRadius={6} style={{ marginBottom: 24 }} />
        <div className="stat-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="stat-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 22 }}>
              <SkeletonBlock width={80} height={40} borderRadius={6} />
              <SkeletonLine width="70%" height={14} />
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 28 }}><SkeletonLine width={200} height={22} /></h3>
        <table className="admin-table">
          <thead><tr><th><SkeletonLine width={80} height={14} /></th><th><SkeletonLine width={80} height={14} /></th><th><SkeletonLine width={80} height={14} /></th></tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => <SkeletonTableRow key={i} columns={3} />)}
          </tbody>
        </table>
        <h3 style={{ marginTop: 28 }}><SkeletonLine width={160} height={22} /></h3>
        <table className="admin-table">
          <thead><tr><th><SkeletonLine width={80} height={14} /></th><th><SkeletonLine width={80} height={14} /></th><th><SkeletonLine width={80} height={14} /></th><th><SkeletonLine width={80} height={14} /></th></tr></thead>
          <tbody>
            {[1, 2, 3, 4].map((i) => <SkeletonTableRow key={i} columns={4} />)}
          </tbody>
        </table>
      </div>
  );
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [pages, setPages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [editSlug, setEditSlug] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState("overview");

  // LLM usage tab state
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmUsers, setLlmUsers] = useState([]);
  const [llmLogs, setLlmLogs] = useState([]);
  const [llmDays, setLlmDays] = useState(30);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");
  const [llmPurposeFilter, setLlmPurposeFilter] = useState("");
  const [llmProviderFilter, setLlmProviderFilter] = useState("");
  const [llmLoaded, setLlmLoaded] = useState(false);

  // Change password state
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpLoading, setCpLoading] = useState(false);
  const [cpMsg, setCpMsg] = useState({ type: "", text: "" });

  // Forgot password state
  const [fpLoading, setFpLoading] = useState(false);
  const [fpMsg, setFpMsg] = useState({ type: "", text: "" });

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (cpNew !== cpConfirm) {
      setCpMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    setCpLoading(true);
    setCpMsg({ type: "", text: "" });
    try {
      await api.changePassword(cpCurrent, cpNew);
      setCpMsg({ type: "success", text: "Password changed successfully" });
      setCpCurrent(""); setCpNew(""); setCpConfirm("");
    } catch (e) {
      setCpMsg({ type: "error", text: e.message });
    } finally {
      setCpLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user?.email) return;
    setFpLoading(true);
    setFpMsg({ type: "", text: "" });
    try {
      await api.forgotPassword(user.email);
      setFpMsg({ type: "success", text: `Reset link sent to ${user.email}` });
    } catch (e) {
      setFpMsg({ type: "error", text: e.message });
    } finally {
      setFpLoading(false);
    }
  };

  const isContentDirty = editContent !== originalContent || editTitle !== originalTitle;

  useEffect(() => {
    Promise.all([api.adminDashboard(), api.adminCmsPages(), api.adminPayments()])
      .then(([s, p, pay]) => { setStats(s); setPages(p); setPayments(pay); })
      .catch((e) => {
        const msg = e.message || "";
        if (msg.includes("403") || msg.includes("Admin access required")) {
          setError("Admin access required. You do not have permission to view this page.");
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const loadLlmUsage = () => {
    setLlmLoading(true);
    setLlmError("");
    Promise.all([
      api.adminLlmUsageSummary(llmDays),
      api.adminLlmUsageByUser(llmDays, 50),
      api.adminLlmUsageLogs({ days: llmDays, purpose: llmPurposeFilter, provider: llmProviderFilter, limit: 100 }),
    ])
      .then(([summary, users, logs]) => {
        setLlmSummary(summary);
        setLlmUsers(users);
        setLlmLogs(logs);
        setLlmLoaded(true);
      })
      .catch((e) => setLlmError(e.message))
      .finally(() => setLlmLoading(false));
  };

  useEffect(() => {
    if (section === "llm-usage") loadLlmUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, llmDays, llmPurposeFilter, llmProviderFilter]);

  const startEdit = (page) => {
    setEditSlug(page.slug);
    setEditTitle(page.title);
    setEditContent(page.content);
    setEditIcon(page.icon || "");
    setOriginalContent(page.content);
    setOriginalTitle(page.title);
  };

  const cancelEdit = () => {
    if (isContentDirty) {
      if (!globalThis.confirm("You have unsaved changes. Discard them?")) return;
    }
    setEditSlug(null);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) { setError("Title cannot be empty"); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await api.adminUpdateCms(editSlug, { title: editTitle, content: editContent, icon: editIcon });
      setPages((prev) => prev.map((p) => p.slug === editSlug ? updated : p));
      setEditSlug(null);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminSkeleton />;
  if (error && !stats) {
    return (
      <div className="container">
        <div className="error">{error}</div>
        {error.includes("Admin access required") && (
          <p>You need admin privileges to access this page. Contact an administrator.</p>
        )}
      </div>
    );
  }

  return (
    <div className="container admin-container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h1>🛡️ Admin Panel</h1>
          <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
        </div>

        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="admin-tabs">
          <button className={`rtab ${section === "overview" ? "active" : ""}`} onClick={() => setSection("overview")}>📊 Overview</button>
          <button className={`rtab ${section === "users" ? "active" : ""}`} onClick={() => setSection("users")}>👥 Users</button>
          <button className={`rtab ${section === "payments" ? "active" : ""}`} onClick={() => setSection("payments")}>💳 Payments</button>
          <button className={`rtab ${section === "llm-usage" ? "active" : ""}`} onClick={() => setSection("llm-usage")}>🤖 LLM Usage</button>
          <button className={`rtab ${section === "cms" ? "active" : ""}`} onClick={() => { setSection("cms"); setEditSlug(null); }}>📝 CMS Pages</button>
          <button className={`rtab ${section === "account" ? "active" : ""}`} onClick={() => setSection("account")}>⚙️ Account</button>
        </div>

        {/* ==================== OVERVIEW ==================== */}
        {section === "overview" && stats && (
          <div className="admin-stats">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-num">{stats.total_users}</div>
                <div className="stat-label">Total Users</div>
              </div>
              <div className="stat-card accent">
                <div className="stat-num">{stats.total_subscribers}</div>
                <div className="stat-label">Subscribers</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{stats.elite_subscribers}</div>
                <div className="stat-label">Elite Plan</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{stats.total_resumes}</div>
                <div className="stat-label">Resumes Created</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{stats.users_not_subscribed}</div>
                <div className="stat-label">Users (No Sub)</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{stats.total_visitors}</div>
                <div className="stat-label">Total Visitors</div>
              </div>
            </div>

            <h3 style={{ marginTop: 28 }}>Revenue</h3>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              <div className="stat-card accent">
                <div className="stat-num">₹{stats.total_revenue?.toLocaleString() || 0}</div>
                <div className="stat-label">Total Revenue</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{((stats.total_subscribers / Math.max(stats.total_users, 1)) * 100).toFixed(1)}%</div>
                <div className="stat-label">Conversion Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">₹{stats.total_subscribers > 0 ? Math.round((stats.total_revenue || 0) / stats.total_subscribers).toLocaleString() : 0}</div>
                <div className="stat-label">Avg / Subscriber</div>
              </div>
            </div>

            <h3 style={{ marginTop: 28 }}>Recent Users</h3>
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Name</th><th>Registered</th></tr></thead>
              <tbody>
                {stats.recent_users.slice(0, 5).map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name || u.email}</td>
                    <td>{u.date ? new Date(u.date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {stats.recent_users.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 20 }}>No users yet</td></tr>
                )}
              </tbody>
            </table>
            {stats.recent_users.length > 5 && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setSection("users")}>View all users →</button>
            )}

            <h3 style={{ marginTop: 28 }}>Recent Payments</h3>
            {payments.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", padding: 12 }}>No payments recorded yet.</p>
            ) : (
              <>
                <table className="admin-table">
                  <thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {payments.slice(0, 5).map((p) => (
                      <tr key={p.id}>
                        <td>{p.user_email || p.user_id.slice(0, 12) + "…"}</td>
                        <td><span className={`plan-badge ${p.plan}`}>{p.plan}</span></td>
                        <td>₹{p.amount?.toLocaleString()}</td>
                        <td><span className={`payment-status status-${p.status}`}>{p.status}</span></td>
                        <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length > 5 && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setSection("payments")}>View all payments →</button>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================== USERS ==================== */}
        {section === "users" && stats && (
          <div className="admin-users">
            <h3>Recent Registrations</h3>
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Name</th><th>Registered</th></tr></thead>
              <tbody>
                {stats.recent_users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name || u.email}</td>
                    <td>{u.date ? new Date(u.date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {stats.recent_users.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 20 }}>No users yet</td></tr>
                )}
              </tbody>
            </table>

            <h3 style={{ marginTop: 28 }}>Recent Subscribers</h3>
            <table className="admin-table">
              <thead><tr><th>User ID</th><th>Plan</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {stats.recent_subscribers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.user_id.slice(0, 12)}…</td>
                    <td><span className={`plan-badge ${s.plan}`}>{s.plan}</span></td>
                    <td>₹{s.amount}</td>
                    <td>{s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {stats.recent_subscribers.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 20 }}>No subscribers yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ==================== PAYMENTS ==================== */}
        {section === "payments" && (
          <div className="admin-payments">
            <h3>Payment History</h3>
            {payments.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", padding: 20, textAlign: "center" }}>No payments recorded yet.</p>
            ) : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.user_email || p.user_id.slice(0, 12) + "…"}</td>
                      <td><span className={`plan-badge ${p.plan}`}>{p.plan}</span></td>
                      <td>₹{p.amount?.toLocaleString()} {p.currency !== "INR" ? p.currency : ""}</td>
                      <td><span className={`payment-status status-${p.status}`}>{p.status}</span></td>
                      <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ==================== LLM USAGE ==================== */}
        {section === "llm-usage" && (
          <div className="admin-llm-usage">
            <div className="usage-filters">
              <label htmlFor="llm-days" style={{ fontSize: 13, color: "var(--ink-soft)" }}>Time range:</label>
              <select id="llm-days" value={llmDays} onChange={(e) => setLlmDays(Number(e.target.value))}>
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
              </select>
              <label htmlFor="llm-purpose" style={{ fontSize: 13, color: "var(--ink-soft)" }}>Purpose:</label>
              <select id="llm-purpose" value={llmPurposeFilter} onChange={(e) => setLlmPurposeFilter(e.target.value)}>
                <option value="">All purposes</option>
                {(llmSummary?.by_purpose || []).map((p) => (
                  <option key={p.purpose} value={p.purpose}>{p.purpose}</option>
                ))}
              </select>
              <label htmlFor="llm-provider" style={{ fontSize: 13, color: "var(--ink-soft)" }}>Provider:</label>
              <select id="llm-provider" value={llmProviderFilter} onChange={(e) => setLlmProviderFilter(e.target.value)}>
                <option value="">All providers</option>
                {(llmSummary?.by_provider || []).map((p) => (
                  <option key={p.provider} value={p.provider}>{p.provider}</option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={loadLlmUsage} disabled={llmLoading}>
                {llmLoading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>

            {llmError && <div className="error" style={{ marginBottom: 16 }}>{llmError}</div>}

            {!llmLoaded && llmLoading ? (
              <p style={{ color: "var(--ink-soft)", textAlign: "center", padding: 20 }}>Loading usage data…</p>
            ) : llmSummary && (
              <>
                <div className="stat-grid">
                  <div className="stat-card accent">
                    <div className="stat-num">${llmSummary.total_cost_usd?.toFixed(4)}</div>
                    <div className="stat-label">Total Cost ({llmSummary.currency})</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num">{llmSummary.total_calls?.toLocaleString()}</div>
                    <div className="stat-label">Total Calls</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num">{llmSummary.total_tokens?.toLocaleString()}</div>
                    <div className="stat-label">Total Tokens</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num">{llmSummary.total_output_tokens?.toLocaleString()}</div>
                    <div className="stat-label">Output Tokens</div>
                  </div>
                </div>

                <div className="usage-breakdown-grid" style={{ marginTop: 20 }}>
                  <div className="usage-breakdown-card">
                    <h4>Cost by Purpose</h4>
                    {(llmSummary.by_purpose || []).length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No calls yet.</p>}
                    {(() => {
                      const max = Math.max(1, ...(llmSummary.by_purpose || []).map((p) => p.cost_usd));
                      return (llmSummary.by_purpose || []).map((p) => (
                        <div className="usage-bar-row" key={p.purpose}>
                          <div className="usage-bar-label" title={p.purpose}>{p.purpose}</div>
                          <div className="usage-bar-track"><div className="usage-bar-fill" style={{ width: `${(p.cost_usd / max) * 100}%` }} /></div>
                          <div className="usage-bar-value">${p.cost_usd.toFixed(4)}</div>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="usage-breakdown-card">
                    <h4>Cost by Modality</h4>
                    {(llmSummary.by_modality || []).length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No calls yet.</p>}
                    {(llmSummary.by_modality || []).map((m) => (
                      <div key={m.modality} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span className={`usage-badge modality-${m.modality}`}>{m.modality}</span>
                        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{m.calls} calls · {m.tokens.toLocaleString()} tok</span>
                        <strong style={{ fontSize: 13 }}>${m.cost_usd.toFixed(4)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="usage-breakdown-card">
                    <h4>Cost by Provider</h4>
                    {(llmSummary.by_provider || []).length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No calls yet.</p>}
                    {(llmSummary.by_provider || []).map((p) => (
                      <div key={p.provider} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span className={`usage-badge provider-${p.provider}`}>{p.provider}</span>
                        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{p.calls} calls · {p.tokens.toLocaleString()} tok</span>
                        <strong style={{ fontSize: 13 }}>${p.cost_usd.toFixed(4)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <h3>Usage by User</h3>
                <table className="admin-table">
                  <thead><tr><th>User</th><th>Calls</th><th>Tokens</th><th>Cost</th><th>Last Used</th></tr></thead>
                  <tbody>
                    {llmUsers.map((u) => (
                      <tr key={u.user_id || "unattributed"}>
                        <td>{u.user_email || u.user_id?.slice(0, 12) + "…" || "(unattributed)"}</td>
                        <td>{u.total_calls.toLocaleString()}</td>
                        <td>{u.total_tokens.toLocaleString()}</td>
                        <td>${u.total_cost_usd.toFixed(4)}</td>
                        <td>{u.last_used_at ? new Date(u.last_used_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {llmUsers.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 20 }}>No usage recorded in this range.</td></tr>
                    )}
                  </tbody>
                </table>

                <h3 style={{ marginTop: 28 }}>Recent Calls</h3>
                <table className="admin-table">
                  <thead><tr><th>Time</th><th>User</th><th>Purpose</th><th>Provider</th><th>Modality</th><th>Tokens (in/out)</th><th>Cost</th></tr></thead>
                  <tbody>
                    {llmLogs.map((l) => (
                      <tr key={l.id}>
                        <td>{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</td>
                        <td>{l.user_email || (l.user_id ? l.user_id.slice(0, 10) + "…" : "—")}</td>
                        <td>{l.purpose}</td>
                        <td><span className={`usage-badge provider-${l.provider}`}>{l.provider}</span></td>
                        <td><span className={`usage-badge modality-${l.modality}`}>{l.modality}</span></td>
                        <td>{l.input_tokens.toLocaleString()} / {l.output_tokens.toLocaleString()}</td>
                        <td>${l.cost_usd.toFixed(5)}</td>
                      </tr>
                    ))}
                    {llmLogs.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 20 }}>No calls logged in this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* ==================== ACCOUNT ==================== */}
        {section === "account" && (
          <div className="admin-account" style={{ maxWidth: 480 }}>
            <h3>Change Password</h3>
            <form onSubmit={handleChangePassword}>
              <div className="field">
                <label htmlFor="cp-current">Current Password</label>
                <input
                  id="cp-current"
                  type="password"
                  value={cpCurrent}
                  onChange={(e) => setCpCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="field">
                <label htmlFor="cp-new">New Password</label>
                <input
                  id="cp-new"
                  type="password"
                  value={cpNew}
                  onChange={(e) => setCpNew(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label htmlFor="cp-confirm">Confirm New Password</label>
                <input
                  id="cp-confirm"
                  type="password"
                  value={cpConfirm}
                  onChange={(e) => setCpConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {cpMsg.text && (
                <div className={cpMsg.type === "error" ? "error" : "success"} style={{ marginBottom: 8 }}>
                  {cpMsg.text}
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={cpLoading || !cpCurrent || !cpNew || !cpConfirm}>
                {cpLoading ? "Saving…" : "Change Password"}
              </button>
            </form>

            <hr style={{ margin: "28px 0", borderColor: "var(--border)" }} />

            <h3>Forgot Password</h3>
            <p style={{ color: "var(--ink-soft)", marginBottom: 12 }}>
              Send a password reset link to <strong>{user?.email}</strong>.
            </p>
            {fpMsg.text && (
              <div className={fpMsg.type === "error" ? "error" : "success"} style={{ marginBottom: 8 }}>
                {fpMsg.text}
              </div>
            )}
            <button className="btn btn-ghost" onClick={handleForgotPassword} disabled={fpLoading}>
              {fpLoading ? "Sending…" : "Send Reset Link"}
            </button>

            <hr style={{ margin: "28px 0", borderColor: "var(--border)" }} />

            <h3>Logout</h3>
            <p style={{ color: "var(--ink-soft)", marginBottom: 12 }}>Sign out of the admin panel.</p>
            <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
          </div>
        )}

        {/* ==================== CMS PAGES ==================== */}
        {section === "cms" && (
          <div className="admin-cms">
            {editSlug ? (
              <div className="cms-editor">
                <h3>Editing: {editTitle}</h3>
                <div className="field">
                  <label htmlFor="cms-title">Page Title</label>
                  <input id="cms-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="cms-icon">Icon (emoji)</label>
                  <input id="cms-icon" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} style={{ width: 80 }} />
                </div>
                <div className="field">
                  <label htmlFor="cms-content">Content (supports Markdown: **bold**, *italic*, ## headings, - lists, [links](url), tables, code)</label>
                  <div className="cms-editor-panes">
                    <div className="cms-editor-pane">
                      <div className="cms-editor-pane-label">Edit</div>
                      <textarea id="cms-content" rows={16} value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ fontFamily: "monospace", fontSize: 13 }} />
                    </div>
                    <div className="cms-editor-pane">
                      <div className="cms-editor-pane-label">Preview</div>
                      <div className="cms-editor-preview">
                        <Markdown>{editContent}</Markdown>
                      </div>
                    </div>
                  </div>
                </div>
                {isContentDirty && <div className="notice" style={{ marginTop: 8 }}>● Unsaved changes</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !editTitle.trim()}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="cms-list">
                {pages.map((p) => (
                  <div key={p.slug} className="cms-card">
                    <div className="cms-card-head">
                      <span>{p.icon} {p.title.replace(/^[^\s]+\s/, "")}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>Edit</button>
                    </div>
                    <div className="cms-card-preview">{p.content.slice(0, 120)}…</div>
                    <div className="cms-card-meta">Slug: /{p.slug} · Updated: {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}</div>
                  </div>
                ))}
                {pages.length === 0 && (
                  <p style={{ color: "var(--ink-soft)", textAlign: "center", padding: 20 }}>No CMS pages found. They will be created automatically on first load.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
  );
}
