import { useEffect, useState } from "react";
import { api } from "../api/client";

async function ensureRazorpay() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function SubscriptionModal({ onClose, onSuccess, initialTab = "plans" }) {
  const [tab, setTab] = useState(initialTab);
  const [plans, setPlans] = useState([]);
  const [refills, setRefills] = useState([]);
  const [selected, setSelected] = useState(null); // { kind, id }
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState(null); // { discount_inr, final_inr, code }
  const [couponErr, setCouponErr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.plans(), api.refillPacks()])
      .then(([p, r]) => {
        setPlans(p.plans || []);
        setRefills(r.refill_packs || []);
        const def = (p.plans || []).find((x) => x.is_default) || (p.plans || [])[0];
        if (initialTab === "refills" && (r.refill_packs || []).length) {
          setSelected({ kind: "refill", id: r.refill_packs[0].id });
        } else if (def) {
          setSelected({ kind: "plan", id: def.id });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [initialTab]);

  const items = tab === "plans" ? plans : refills;
  const selItem = items.find((x) => selected && selected.kind === (tab === "plans" ? "plan" : "refill") && x.id === selected.id);

  const pick = (id) => {
    setSelected({ kind: tab === "plans" ? "plan" : "refill", id });
    setCouponInfo(null);
    setCouponErr("");
  };

  const switchTab = (t) => {
    setTab(t);
    setCouponInfo(null);
    setCouponErr("");
    const list = t === "plans" ? plans : refills;
    if (list.length) setSelected({ kind: t === "plans" ? "plan" : "refill", id: list[0].id });
  };

  const applyCoupon = async () => {
    if (!coupon.trim() || !selected) return;
    setCouponErr("");
    try {
      const info = await api.validateCoupon(coupon.trim(), selected.kind, selected.id);
      setCouponInfo(info);
    } catch (e) {
      setCouponInfo(null);
      setCouponErr(e.message);
    }
  };

  const basePrice = selItem?.price_inr || 0;
  const finalPrice = couponInfo ? couponInfo.final_inr : basePrice;

  const purchase = async () => {
    if (!selected) return;
    setProcessing(true);
    setError("");
    try {
      const couponCode = couponInfo ? couponInfo.code : undefined;
      const plan = tab === "plans" ? selItem : null;

      // Recurring plan with a Razorpay plan id → true subscription flow.
      if (plan && plan.recurring) {
        const sub = await api.createSubscription(plan.id);
        if (sub.demo || sub.razorpay_key_id === "demo_mode") { onSuccess?.(); onClose(); return; }
        await ensureRazorpay();
        const rzp = new window.Razorpay({
          key: sub.razorpay_key_id, subscription_id: sub.subscription_id,
          name: "resumesGPT", description: `${plan.name} — monthly`, image: "/logo.png",
          handler: async (resp) => {
            try {
              await api.verifyPayment({
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                razorpay_subscription_id: resp.razorpay_subscription_id || sub.subscription_id,
              });
              onSuccess?.(); onClose();
            } catch (e) { setError("Verification failed: " + e.message); setProcessing(false); }
          },
          theme: { color: "#d97706" }, modal: { ondismiss: () => setProcessing(false) },
        });
        rzp.open();
        return;
      }

      // One-time order (refill, or non-recurring monthly plan) — coupon-eligible.
      const order = await api.createOrder({
        kind: selected.kind, target_id: selected.id, coupon_code: couponCode,
      });
      // ₹0 after a 100%-off coupon → activated server-side, no gateway needed.
      if (order.free) { onSuccess?.(); onClose(); return; }
      await ensureRazorpay();
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id, amount: order.amount, currency: "INR",
        name: "resumesGPT", description: selItem?.name || "Purchase", image: "/logo.png",
        order_id: order.order_id,
        handler: async (resp) => {
          try {
            await api.verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            onSuccess?.(); onClose();
          } catch (e) { setError("Verification failed: " + e.message); setProcessing(false); }
        },
        theme: { color: "#d97706" }, modal: { ondismiss: () => setProcessing(false) },
      });
      rzp.on("payment.failed", (r) => { setError(`Payment failed: ${r.error.description}`); setProcessing(false); });
      rzp.open();
    } catch (e) {
      setError(e.message || "Payment failed.");
      setProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sub-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <img src="/logo.png" alt="resumesGPT" style={{ height: 44, margin: "0 auto 8px", display: "block" }} />
        <h2 style={{ textAlign: "center", marginTop: 0 }}>Get more interview minutes</h2>

        <div className="admin-tabs" style={{ justifyContent: "center", marginBottom: 14 }}>
          <button className={`rtab ${tab === "plans" ? "active" : ""}`} onClick={() => switchTab("plans")}>📅 Monthly Plans</button>
          <button className={`rtab ${tab === "refills" ? "active" : ""}`} onClick={() => switchTab("refills")}>⚡ Refill Packs</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--ink-soft)" }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it) => {
              const isSel = selItem && selItem.id === it.id;
              const minutes = tab === "plans" ? it.interview_minutes : it.total_minutes;
              return (
                <button key={it.id} onClick={() => pick(it.id)}
                  className="elite-checkout-card"
                  style={{
                    textAlign: "left", cursor: "pointer", padding: 14,
                    border: isSel ? "2px solid #d97706" : "1px solid var(--line)",
                    background: isSel ? "rgba(217,119,6,0.06)" : "transparent",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{it.name}</strong>
                      {it.badge && <span className="plan-popular" style={{ position: "static", transform: "none", marginLeft: 8, fontSize: 11 }}>{it.badge}</span>}
                      <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                        {minutes} interview minutes{tab === "plans" ? " / month" : ""}
                        {tab === "refills" && it.bonus_minutes ? ` (+${it.bonus_minutes} bonus)` : ""}
                      </div>
                    </div>
                    <div className="plan-price" style={{ fontSize: 22 }}><span className="plan-currency">₹</span>{it.price_inr}</div>
                  </div>
                  {tab === "plans" && it.features?.length ? (
                    <ul className="plan-features" style={{ marginTop: 8, fontSize: 13 }}>
                      {it.features.slice(0, 4).map((f, i) => <li key={i}>✓ {f}</li>)}
                    </ul>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {/* Coupon */}
        {selItem && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="Coupon code" value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())} style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={applyCoupon} disabled={!coupon.trim()}>Apply</button>
            </div>
            {couponErr && <div className="error" style={{ marginTop: 6 }}>{couponErr}</div>}
            {couponInfo && (
              <div style={{ marginTop: 6, color: "#16a34a", fontSize: 13 }}>
                ✓ {couponInfo.code} applied — you save ₹{couponInfo.discount_inr}
              </div>
            )}
          </div>
        )}

        {error && <div className="error" style={{ margin: "12px 0" }}>{error}</div>}

        <button className="btn btn-primary"
          style={{ width: "100%", padding: 14, fontSize: 16, marginTop: 16, background: "linear-gradient(135deg, #d97706, #b45309)" }}
          onClick={purchase} disabled={processing || !selItem}>
          {processing ? "Processing…" : selItem
            ? `Pay ₹${finalPrice}${couponInfo ? ` (was ₹${basePrice})` : ""} — ${tab === "plans" ? "Subscribe" : "Buy refill"}`
            : "Select an option"}
        </button>

        <p className="sub-note">🔒 Secure payment via Razorpay · SSL encrypted</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, width: "100%" }} onClick={onClose}>Maybe later</button>
      </div>
    </div>
  );
}
