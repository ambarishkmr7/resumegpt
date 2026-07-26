import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ensureRazorpay } from "../utils/razorpay";

export default function SubscriptionModal({ onClose, onSuccess, initialTab = "plans" }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(initialTab);
  const [plans, setPlans] = useState([]);
  const [refills, setRefills] = useState([]);
  const [selected, setSelected] = useState(null); // { kind, id }
  const [currentPlanSlug, setCurrentPlanSlug] = useState(null); // active subscription's plan
  const [autoPay, setAutoPay] = useState(false); // opt-in recurring mandate (plans only)
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState(null); // { discount_inr, final_inr, code }
  const [couponErr, setCouponErr] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.plans(), api.refillPacks(), api.subscriptionStatus().catch(() => null)])
      .then(([p, r, s]) => {
        // The ₹0 tier belongs in the pricing grid, not in a checkout list —
        // there is nothing to pay for and the server rejects the order anyway.
        const planList = (p.plans || []).filter((x) => !x.is_free);
        const refillList = r.refill_packs || [];
        setPlans(planList);
        setRefills(refillList);
        const activeSlug = s?.is_subscribed ? s.plan : null;
        setCurrentPlanSlug(activeSlug);
        // Already subscribed → default to refills (that's the only sensible
        // purchase mid-cycle); otherwise preselect the default plan.
        if ((initialTab === "refills" || activeSlug) && refillList.length) {
          setTab(activeSlug ? "refills" : initialTab);
          setSelected({ kind: "refill", id: refillList[0].id });
        } else {
          const def = planList.find((x) => x.is_default) || planList[0];
          if (def) setSelected({ kind: "plan", id: def.id });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [initialTab]);

  const items = tab === "plans" ? plans : refills;
  const selItem = items.find((x) => selected && selected.kind === (tab === "plans" ? "plan" : "refill") && x.id === selected.id);
  const isCurrentPlan = (it) => tab === "plans" && currentPlanSlug && it.slug === currentPlanSlug;
  const selIsCurrent = selItem ? isCurrentPlan(selItem) : false;

  // Auto-pay needs a Razorpay plan id on the plan (admin-configured); refills are
  // one-time by nature and never recur.
  const autoPaySupported = tab === "plans" && !!selItem?.recurring;
  const autoPayOn = autoPaySupported && autoPay;

  const pick = (id) => {
    setSelected({ kind: tab === "plans" ? "plan" : "refill", id });
    setCouponInfo(null);
    setCouponErr("");
  };

  const switchTab = (t) => {
    setTab(t);
    setCouponInfo(null);
    setCouponErr("");
    if (t !== "plans") setAutoPay(false);
    const list = t === "plans" ? plans : refills;
    if (list.length) {
      // Don't preselect the plan the user already has.
      const first = t === "plans"
        ? (list.find((x) => x.slug !== currentPlanSlug) || list[0])
        : list[0];
      setSelected({ kind: t === "plans" ? "plan" : "refill", id: first.id });
    }
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

  // Every successful purchase ends on the in-app receipt page. onSuccess() still
  // fires first so the page behind us refreshes its plan/usage state (and drops
  // any "recharge" nudge) before we navigate away.
  const finish = (ref) => {
    onSuccess?.();
    onClose();
    if (ref) navigate(`/payment/success/${encodeURIComponent(ref)}`);
  };

  const purchase = async () => {
    if (!selected) return;
    setProcessing(true);
    setError("");
    try {
      const couponCode = couponInfo ? couponInfo.code : undefined;
      const plan = tab === "plans" ? selItem : null;

      // Auto-payment ticked → set up a Razorpay mandate that charges every cycle.
      // Unticked → a plain one-time order the user repeats when they choose to.
      if (plan && autoPayOn) {
        const sub = await api.createSubscription(plan.id);
        if (sub.demo || sub.razorpay_key_id === "demo_mode") { finish(sub.payment_ref); return; }
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
              finish(sub.payment_ref || resp.razorpay_payment_id);
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
      if (order.free) { finish(order.payment_ref); return; }
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
            finish(order.payment_ref || resp.razorpay_order_id);
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
        <h2 style={{ textAlign: "center", marginTop: 0 }}>
          {currentPlanSlug ? "Manage your plan" : "Get more interview minutes"}
        </h2>
        {currentPlanSlug && (
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--ink-soft)", marginTop: -6 }}>
            You already have an active plan — top up with a refill, or switch plans.
          </p>
        )}

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
              const isCurrent = isCurrentPlan(it);
              const minutes = tab === "plans" ? it.interview_minutes : it.total_minutes;
              return (
                <button key={it.id} onClick={() => !isCurrent && pick(it.id)}
                  className="elite-checkout-card"
                  style={{
                    textAlign: "left", cursor: isCurrent ? "default" : "pointer", padding: 14,
                    border: isCurrent ? "2px solid #16a34a" : isSel ? "2px solid #d97706" : "1px solid var(--line)",
                    background: isCurrent ? "rgba(22,163,74,0.06)" : isSel ? "rgba(217,119,6,0.06)" : "transparent",
                    opacity: isCurrent ? 0.85 : 1,
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{it.name}</strong>
                      {isCurrent && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: 999 }}>✓ Current plan</span>}
                      {it.badge && <span className="plan-popular" style={{ position: "static", transform: "none", marginLeft: 8, fontSize: 11 }}>{it.badge}</span>}
                      <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                        {minutes} interview minutes{tab === "plans" ? " / month" : ""}
                        {tab === "plans" && it.monthly_tokens
                          ? ` · ${(it.monthly_tokens / 1_000_000).toLocaleString()}M AI tokens`
                          : ""}
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

        {/* Auto-payment — monthly plans only; refills are one-time by nature. */}
        {tab === "plans" && selItem && !selIsCurrent && (
          <label
            htmlFor="autopay-opt-in"
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: 12,
              border: `1px solid ${autoPayOn ? "#d97706" : "var(--line)"}`, borderRadius: 10,
              background: autoPayOn ? "rgba(217,119,6,0.06)" : "transparent",
              cursor: autoPaySupported ? "pointer" : "not-allowed",
              opacity: autoPaySupported ? 1 : 0.6,
            }}
          >
            <input
              id="autopay-opt-in"
              type="checkbox"
              checked={autoPayOn}
              disabled={!autoPaySupported}
              onChange={(e) => {
                setAutoPay(e.target.checked);
                // Coupons are applied to one-time orders only; a recurring
                // mandate always charges the plan's list price.
                if (e.target.checked) { setCouponInfo(null); setCouponErr(""); }
              }}
              style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13 }}>
              <strong>Enable auto-payment</strong>
              <div style={{ color: "var(--ink-soft)", marginTop: 2 }}>
                {autoPaySupported
                  ? `Renew ${selItem.name} automatically every month at ₹${basePrice}. You can turn this off any time from Settings → Plan & Billing.`
                  : "This plan isn't set up for auto-payment yet — you can pay once now and renew manually."}
              </div>
              {autoPayOn && (
                <div style={{ color: "var(--ink-soft)", marginTop: 4, fontSize: 12 }}>
                  Coupons apply to one-time payments only, so none is used here.
                </div>
              )}
            </span>
          </label>
        )}

        {/* Coupon — not applicable to a recurring mandate. */}
        {selItem && !autoPayOn && (
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
          onClick={purchase} disabled={processing || !selItem || selIsCurrent}>
          {processing ? "Processing…" : selIsCurrent
            ? "✓ This is your current plan"
            : selItem
            ? `Pay ₹${autoPayOn ? basePrice : finalPrice}${couponInfo && !autoPayOn ? ` (was ₹${basePrice})` : ""} — ${autoPayOn ? "Subscribe & auto-renew" : tab === "plans" ? "Subscribe" : "Buy refill"}`
            : "Select an option"}
        </button>

        <p className="sub-note">🔒 Secure payment via Razorpay · SSL encrypted</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, width: "100%" }} onClick={onClose}>Maybe later</button>
      </div>
    </div>
  );
}
