import { useEffect, useState } from "react";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [pages, setPages] = useState([]);
  const [editSlug, setEditSlug] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.adminDashboard(), api.adminCmsPages()])
      .then(([s, p]) => { setStats(s); setPages(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = (page) => {
    setEditSlug(page.slug);
    setEditTitle(page.title);
    setEditContent(page.content);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await api.adminUpdateCms(editSlug, { title: editTitle, content: editContent });
      setPages((prev) => prev.map((p) => p.slug === editSlug ? updated : p));
      setEditSlug(null);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <><Topbar /><div className="container">Loading admin panel…</div></>;
  if (error && !stats) return <><Topbar /><div className="container"><div className="error">{error}</div><p>You may need admin access. Run: <code>POST /api/admin/make-admin</code></p></div></>;

  return (
    <>
      <Topbar />
      <div className="container admin-container">
        <h1>Admin Panel</h1>
        <div className="admin-tabs">
          <button className={`rtab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>📊 Dashboard</button>
          <button className={`rtab ${tab === "cms" ? "active" : ""}`} onClick={() => setTab("cms")}>📝 CMS Pages</button>
          <button className={`rtab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>👥 Recent Users</button>
        </div>

        {tab === "dashboard" && stats && (
          <div className="admin-stats">
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-num">{stats.total_users}</div><div className="stat-label">Total Users</div></div>
              <div className="stat-card accent"><div className="stat-num">{stats.total_subscribers}</div><div className="stat-label">Total Subscribers</div></div>
              <div className="stat-card"><div className="stat-num">{stats.elite_subscribers}</div><div className="stat-label">Elite Plan</div></div>
              <div className="stat-card"><div className="stat-num">{stats.total_resumes}</div><div className="stat-label">Total Resumes</div></div>
              <div className="stat-card"><div className="stat-num">{stats.users_not_subscribed}</div><div className="stat-label">Users (No Sub)</div></div>
              <div className="stat-card"><div className="stat-num">{stats.total_visitors}</div><div className="stat-label">Total Visitors</div></div>
              <div className="stat-card"><div className="stat-num">{stats.unregistered_visitors}</div><div className="stat-label">Not Registered</div></div>
            </div>

            <h3 style={{ marginTop: 24 }}>Revenue Overview</h3>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="stat-card">
                <div className="stat-num">₹{stats.total_subscribers * 1999}</div>
                <div className="stat-label">Total Revenue</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{((stats.total_subscribers / Math.max(stats.total_users, 1)) * 100).toFixed(1)}%</div>
                <div className="stat-label">Conversion Rate</div>
              </div>
            </div>
          </div>
        )}

        {tab === "cms" && (
          <div className="admin-cms">
            {editSlug ? (
              <div className="cms-editor">
                <h3>Editing: {editTitle}</h3>
                <div className="field">
                  <label>Page Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label>Content (supports **bold**, bullet points with •, and paragraphs)</label>
                  <textarea rows={16} value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ fontFamily: "monospace", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditSlug(null)}>Cancel</button>
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
              </div>
            )}
          </div>
        )}

        {tab === "users" && stats && (
          <div className="admin-users">
            <h3>Recent Registrations</h3>
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Name</th><th>Registered</th></tr></thead>
              <tbody>
                {stats.recent_users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td><td>{u.name || "—"}</td>
                    <td>{new Date(u.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 24 }}>Recent Subscribers</h3>
            <table className="admin-table">
              <thead><tr><th>User ID</th><th>Plan</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {stats.recent_subscribers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.user_id.slice(0, 12)}…</td>
                    <td><span className={`plan-badge ${s.plan}`}>{s.plan}</span></td>
                    <td>₹{s.amount}</td>
                    <td>{new Date(s.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
