import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import Pagination from "./Pagination.jsx";

const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const mins = (s) => `${Math.round((s ?? 0) / 60)} min`;

// ── Plans ─────────────────────────────────────────────────────────────────────
function PlansSection() {
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // plan object or {} for new
  const [msg, setMsg] = useState("");

  const load = useCallback(() => api.adminPlans({ page }).then(setData).catch((e) => setMsg(e.message)), [page]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, description: f.description.value,
      price_inr: Number(f.price_inr.value), interview_minutes: Number(f.interview_minutes.value),
      features: f.features.value.split("\n").map((x) => x.trim()).filter(Boolean),
      badge: f.badge.value || null, is_active: f.is_active.checked, is_default: f.is_default.checked,
      display_order: Number(f.display_order.value || 100),
    };
    try { await api.adminSavePlan(editing.id, body); setEditing(null); setMsg("Saved."); load(); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>📅 Subscription Plans</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New plan</button>
      </div>
      {msg && <div className="mi-note" style={{ margin: "6px 0" }}>{msg}</div>}
      <table className="admin-table">
        <thead><tr><th>Name</th><th>Price</th><th>Minutes</th><th>Active</th><th>Default</th><th></th></tr></thead>
        <tbody>
          {data.items.map((p) => (
            <tr key={p.id}>
              <td>{p.name} {p.badge && <span className="plan-popular" style={{ position: "static", transform: "none", fontSize: 10 }}>{p.badge}</span>}</td>
              <td>{inr(p.price_inr)}/mo</td>
              <td>{p.interview_minutes}</td>
              <td>{p.is_active ? "✓" : "—"}</td>
              <td>{p.is_default ? "★" : ""}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm(`Delete ${p.name}?`)) { await api.adminDeletePlan(p.id); load(); } }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onChange={setPage} />

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ maxWidth: 460 }}>
            <h3>{editing.id ? "Edit" : "New"} plan</h3>
            <label>Name<input className="input" name="name" defaultValue={editing.name || ""} required /></label>
            <label>Description<input className="input" name="description" defaultValue={editing.description || ""} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>Price (₹/mo)<input className="input" name="price_inr" type="number" defaultValue={editing.price_inr ?? 500} /></label>
              <label style={{ flex: 1 }}>Minutes/mo<input className="input" name="interview_minutes" type="number" defaultValue={editing.interview_minutes ?? 60} /></label>
            </div>
            <label>Features (one per line)<textarea className="input" name="features" rows={4} defaultValue={(editing.features || []).join("\n")} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>Badge<input className="input" name="badge" defaultValue={editing.badge || ""} /></label>
              <label style={{ flex: 1 }}>Order<input className="input" name="display_order" type="number" defaultValue={editing.display_order ?? 100} /></label>
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="is_active" defaultChecked={editing.is_active ?? true} /> Active</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="is_default" defaultChecked={editing.is_default ?? false} /> Default plan</label>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Refill packs ──────────────────────────────────────────────────────────────
function RefillsSection() {
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.adminRefills({ page }).then(setData).catch((e) => setMsg(e.message)), [page]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, description: f.description.value, price_inr: Number(f.price_inr.value),
      amount_minutes: Number(f.amount_minutes.value), bonus_minutes: Number(f.bonus_minutes.value || 0),
      is_active: f.is_active.checked, display_order: Number(f.display_order.value || 100),
    };
    try { await api.adminSaveRefill(editing.id, body); setEditing(null); load(); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>⚡ Refill Packs</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New refill</button>
      </div>
      {msg && <div className="mi-note">{msg}</div>}
      <table className="admin-table">
        <thead><tr><th>Name</th><th>Price</th><th>Minutes</th><th>Bonus</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td><td>{inr(r.price_inr)}</td><td>{r.amount_minutes}</td>
              <td>{r.bonus_minutes || "—"}</td><td>{r.is_active ? "✓" : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await api.adminDeleteRefill(r.id); load(); } }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onChange={setPage} />

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ maxWidth: 420 }}>
            <h3>{editing.id ? "Edit" : "New"} refill</h3>
            <label>Name<input className="input" name="name" defaultValue={editing.name || ""} required /></label>
            <label>Description<input className="input" name="description" defaultValue={editing.description || ""} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>Price (₹)<input className="input" name="price_inr" type="number" defaultValue={editing.price_inr ?? 99} /></label>
              <label style={{ flex: 1 }}>Minutes<input className="input" name="amount_minutes" type="number" defaultValue={editing.amount_minutes ?? 30} /></label>
              <label style={{ flex: 1 }}>Bonus<input className="input" name="bonus_minutes" type="number" defaultValue={editing.bonus_minutes ?? 0} /></label>
            </div>
            <label>Order<input className="input" name="display_order" type="number" defaultValue={editing.display_order ?? 100} /></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="is_active" defaultChecked={editing.is_active ?? true} /> Active</label>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Coupons ───────────────────────────────────────────────────────────────────
function CouponsSection() {
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.adminCoupons({ page }).then(setData).catch((e) => setMsg(e.message)), [page]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      code: f.code.value, description: f.description.value, discount_type: f.discount_type.value,
      discount_value: Number(f.discount_value.value), applies_to: f.applies_to.value,
      min_amount_inr: Number(f.min_amount_inr.value || 0),
      max_redemptions: f.max_redemptions.value ? Number(f.max_redemptions.value) : null,
      per_user_limit: Number(f.per_user_limit.value || 1),
      expires_at: f.expires_at.value || null, is_active: f.is_active.checked,
    };
    try { await api.adminSaveCoupon(editing.id, body); setEditing(null); load(); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>🎟️ Coupons</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New coupon</button>
      </div>
      {msg && <div className="mi-note">{msg}</div>}
      <table className="admin-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Applies</th><th>Used</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {data.items.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.code}</strong></td>
              <td>{c.discount_type === "percent" ? `${c.discount_value}%` : inr(c.discount_value)}</td>
              <td>{c.applies_to}</td>
              <td>{c.redeemed_count}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</td>
              <td>{c.is_active ? "✓" : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm(`Delete ${c.code}?`)) { await api.adminDeleteCoupon(c.id); load(); } }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onChange={setPage} />

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ maxWidth: 440 }}>
            <h3>{editing.id ? "Edit" : "New"} coupon</h3>
            <label>Code<input className="input" name="code" defaultValue={editing.code || ""} required style={{ textTransform: "uppercase" }} /></label>
            <label>Description<input className="input" name="description" defaultValue={editing.description || ""} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>Type
                <select className="input" name="discount_type" defaultValue={editing.discount_type || "percent"}>
                  <option value="percent">Percent</option><option value="flat">Flat ₹</option>
                </select>
              </label>
              <label style={{ flex: 1 }}>Value<input className="input" name="discount_value" type="number" defaultValue={editing.discount_value ?? 10} /></label>
              <label style={{ flex: 1 }}>Applies
                <select className="input" name="applies_to" defaultValue={editing.applies_to || "all"}>
                  <option value="all">All</option><option value="plan">Plans</option><option value="refill">Refills</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1 }}>Min ₹<input className="input" name="min_amount_inr" type="number" defaultValue={editing.min_amount_inr ?? 0} /></label>
              <label style={{ flex: 1 }}>Max uses<input className="input" name="max_redemptions" type="number" defaultValue={editing.max_redemptions ?? ""} /></label>
              <label style={{ flex: 1 }}>Per user<input className="input" name="per_user_limit" type="number" defaultValue={editing.per_user_limit ?? 1} /></label>
            </div>
            <label>Expires<input className="input" name="expires_at" type="date" defaultValue={editing.expires_at ? editing.expires_at.slice(0, 10) : ""} /></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="is_active" defaultChecked={editing.is_active ?? true} /> Active</label>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Subscriptions ─────────────────────────────────────────────────────────────
function SubscriptionsSection() {
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [plans, setPlans] = useState([]);
  const [grant, setGrant] = useState({ email: "", plan_id: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.adminSubscriptions({ page, status }).then(setData).catch(() => {}), [page, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.adminPlans({ page_size: 50 }).then((d) => setPlans(d.items || [])).catch(() => {}); }, []);

  const doGrant = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const r = await api.adminGrantSubscription(grant.email.trim(), grant.plan_id || (plans[0] && plans[0].id));
      setMsg(`✓ Granted ${r.plan} to ${r.user_email}`);
      setGrant({ email: "", plan_id: "" });
      load();
    } catch (err) { setMsg(err.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>🔁 Subscriptions</h3>
        <select className="input" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} style={{ width: 160 }}>
          <option value="">All statuses</option><option value="active">Active</option>
          <option value="cancelled">Cancelled</option><option value="halted">Halted</option>
        </select>
      </div>

      {/* Grant a plan to a user for free (comp / testing) */}
      <form onSubmit={doGrant} style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Grant plan (free ₹0):</span>
        <input className="input" placeholder="user email" value={grant.email}
          onChange={(e) => setGrant({ ...grant, email: e.target.value })} style={{ width: 220 }} required />
        <select className="input" value={grant.plan_id} onChange={(e) => setGrant({ ...grant, plan_id: e.target.value })} style={{ width: 160 }}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.price_inr}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" type="submit">Grant</button>
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </form>
      <table className="admin-table">
        <thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Amount</th><th>Renews</th></tr></thead>
        <tbody>
          {data.items.map((s) => (
            <tr key={s.id}>
              <td>{s.user_email}</td><td>{s.plan_name}</td><td>{s.status}</td>
              <td>{inr(s.amount)}/{s.interval}</td>
              <td>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onChange={setPage} />
    </div>
  );
}

// ── Per-user usage ────────────────────────────────────────────────────────────
function UsageSection() {
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.adminUsage({ page, q }).then(setData).catch(() => {}), [page, q]);
  useEffect(() => { load(); }, [load]);

  const adjust = async (uid) => {
    const v = prompt("Adjust minutes (use a negative number to deduct):", "30");
    if (v == null) return;
    try { const r = await api.adminAdjustUsage(uid, Number(v)); setMsg(`Updated — ${r.available_minutes} min available.`); load(); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3>⏱️ User Usage</h3>
        <input className="input" placeholder="Search email…" value={q}
          onChange={(e) => { setPage(1); setQ(e.target.value); }} style={{ width: 220 }} />
      </div>
      {msg && <div className="mi-note">{msg}</div>}
      <table className="admin-table">
        <thead><tr><th>User</th><th>Source</th><th>Allowance</th><th>Used</th><th>Refill</th><th>Available</th><th></th></tr></thead>
        <tbody>
          {data.items.map((u) => (
            <tr key={u.user_id}>
              <td>{u.user_email}</td><td>{u.source}</td><td>{mins(u.allowance_seconds)}</td>
              <td>{mins(u.used_seconds)}</td><td>{mins(u.refill_seconds)}</td>
              <td><strong>{u.available_minutes} min</strong></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => adjust(u.user_id)}>Adjust</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onChange={setPage} />
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsSection() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.adminSettings().then(setS).catch((e) => setMsg(e.message)); }, []);
  if (!s) return <p className="mi-note">Loading…</p>;
  const save = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api.adminSaveSettings({
        free_trial_interview_seconds: Number(f.trial.value) * 60,
        usd_to_inr_rate: Number(f.rate.value),
        interview_hard_cap_seconds: Number(f.cap.value) * 60,
      });
      setS(r); setMsg("Saved.");
    } catch (err) { setMsg(err.message); }
  };
  return (
    <form onSubmit={save} style={{ maxWidth: 420 }}>
      <h3>⚙️ Billing Settings</h3>
      {msg && <div className="mi-note">{msg}</div>}
      <label>Free trial minutes (0 = subscription-only)
        <input className="input" name="trial" type="number" defaultValue={Math.round((s.free_trial_interview_seconds || 0) / 60)} />
      </label>
      <label>Per-session hard cap (minutes)
        <input className="input" name="cap" type="number" defaultValue={Math.round((s.interview_hard_cap_seconds || 3600) / 60)} />
      </label>
      <label>USD → INR rate (for Profit & Loss)
        <input className="input" name="rate" type="number" step="0.01" defaultValue={s.usd_to_inr_rate || 84} />
      </label>
      <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>Save settings</button>
    </form>
  );
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
function ProfitLossSection() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.adminProfitLoss(days).then(setD).catch((e) => setErr(e.message)); }, [days]);
  if (err) return <div className="mi-error">{err}</div>;
  if (!d) return <p className="mi-note">Loading…</p>;
  const tile = (label, val, color) => (
    <div className="admin-stat" style={{ flex: 1, minWidth: 150, padding: 14, border: "1px solid var(--line)", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
    </div>
  );
  const maxV = Math.max(1, ...d.daily.map((x) => Math.max(x.revenue_inr, x.cost_inr)));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>📈 Profit & Loss</h3>
        <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 140 }}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option><option value={365}>Last year</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        {tile("Net revenue", inr(d.net_revenue_inr), "#16a34a")}
        {tile("LLM cost", inr(d.cost_inr), "#dc2626")}
        {tile("Gross profit", inr(d.gross_profit_inr), d.gross_profit_inr >= 0 ? "#16a34a" : "#dc2626")}
        {tile("Margin", `${d.margin_pct}%`, d.margin_pct >= 40 ? "#16a34a" : "#d97706")}
        {tile("Refunds", inr(d.refunds_inr), "var(--ink)")}
      </div>

      {/* Daily revenue vs cost */}
      <div className="admin-card" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>Daily revenue (green) vs LLM cost (red)</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
          {d.daily.map((x) => (
            <div key={x.date} title={`${x.date}: rev ${inr(x.revenue_inr)}, cost ${inr(x.cost_inr)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
              <div style={{ height: `${(x.revenue_inr / maxV) * 100}%`, background: "#16a34a", borderRadius: "2px 2px 0 0" }} />
              <div style={{ height: `${(x.cost_inr / maxV) * 100}%`, background: "#dc2626" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h4>Revenue by type</h4>
          <table className="admin-table">
            <thead><tr><th>Type</th><th>Count</th><th>Revenue</th></tr></thead>
            <tbody>{d.revenue_by_type.map((r) => <tr key={r.type}><td>{r.type}</td><td>{r.count}</td><td>{inr(r.revenue_inr)}</td></tr>)}</tbody>
          </table>
          <h4>Per-plan revenue</h4>
          <table className="admin-table">
            <thead><tr><th>Plan</th><th>Subs</th><th>Revenue</th></tr></thead>
            <tbody>{d.per_plan.map((r) => <tr key={r.plan_id || "x"}><td>{r.plan_name}</td><td>{r.count}</td><td>{inr(r.revenue_inr)}</td></tr>)}</tbody>
          </table>
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h4>Heaviest cost users</h4>
          <table className="admin-table">
            <thead><tr><th>User</th><th>Cost</th><th>Revenue</th><th>Net</th></tr></thead>
            <tbody>{d.loss_making_users.map((u) => (
              <tr key={u.user_id}><td>{u.user_email || u.user_id.slice(0, 8)}</td><td>{inr(u.cost_inr)}</td>
                <td>{inr(u.revenue_inr)}</td><td style={{ color: u.net_inr < 0 ? "#dc2626" : "#16a34a" }}>{inr(u.net_inr)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <h4 style={{ marginTop: 16 }}>💡 Suggestions</h4>
      <ul style={{ lineHeight: 1.7 }}>
        {d.suggestions.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}

export default function AdminBilling({ section }) {
  switch (section) {
    case "plans": return <PlansSection />;
    case "refills": return <RefillsSection />;
    case "coupons": return <CouponsSection />;
    case "subscriptions": return <SubscriptionsSection />;
    case "usage": return <UsageSection />;
    case "settings": return <SettingsSection />;
    case "profit-loss": return <ProfitLossSection />;
    default: return null;
  }
}
