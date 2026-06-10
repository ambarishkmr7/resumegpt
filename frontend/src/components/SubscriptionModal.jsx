import { useState } from "react";
import { api } from "../api/client";

export default function SubscriptionModal({ onClose, onSuccess }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setProcessing(true); setError("");
    try {
      const order = await api.createOrder("elite");

      if (order.razorpay_key_id === "demo_mode" || !order.razorpay_key_id) {
        await api.checkout("pay_demo_" + Date.now(), "elite");
        onSuccess?.(); onClose(); return;
      }

      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: "INR",
        name: "ResumeGPT",
        description: "Elite Plan — Lifetime Access",
        image: "/logo.png",
        order_id: order.order_id,
        handler: async (response) => {
          try {
            await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: "elite",
            });
            onSuccess?.(); onClose();
          } catch (e) { setError("Payment verification failed: " + e.message); setProcessing(false); }
        },
        theme: { color: "#d97706" },
        modal: { ondismiss: () => setProcessing(false) },
      });
      rzp.on("payment.failed", (resp) => {
        setError(`Payment failed: ${resp.error.description}`); setProcessing(false);
      });
      rzp.open(); return;
    } catch (e) { setError(e.message || "Payment failed."); }
    finally { setProcessing(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sub-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <img src="/logo.png" alt="ResumeGPT" style={{ height: 48, margin: "0 auto 10px", display: "block" }} />
        <h2 style={{ textAlign: "center", marginTop: 0 }}>Unlock ResumeGPT Elite</h2>
        <p className="sub-desc">One-time payment of ₹1,999. Lifetime access. No recurring charges.</p>

        <div className="elite-checkout-card">
          <div className="plan-popular" style={{ position: "static", transform: "none", marginBottom: 12 }}>✨ LIFETIME ACCESS</div>
          <div className="plan-price" style={{ textAlign: "center" }}><span className="plan-currency">₹</span>1,999</div>
          <div className="plan-period" style={{ textAlign: "center" }}>one-time payment</div>

          <ul className="plan-features">
            <li>✓ Unlimited PDF & DOCX downloads</li>
            <li>✓ All 30 professional templates</li>
            <li>✓ AI career analysis & roadmap</li>
            <li>✓ AI resume rewriting (3 variants)</li>
            <li>✓ Professional writeup & cover letter generator</li>
            <li>✓ Job search agent — LinkedIn, Naukri, Indeed, RemoteJobs</li>
            <li>✓ Reference resume import</li>
            <li>🤖 AI Career Counseling Bot</li>
            <li>🎤 Mock Interview Practice</li>
            <li>📊 Interview Rating & Gap Analysis</li>
            <li>🚀 AI Job Application Agent</li>
            <li>✓ YouTube & course recommendations</li>
            <li>✓ Priority support</li>
            <li>✓ Early access to new features</li>
          </ul>
        </div>

        {error && <div className="error" style={{ margin: "12px 0" }}>{error}</div>}

        <button className="btn btn-primary"
          style={{ width: "100%", padding: 14, fontSize: 16, marginTop: 16, background: "linear-gradient(135deg, #d97706, #b45309)" }}
          onClick={handleCheckout} disabled={processing}>
          {processing ? "Processing payment…" : "Pay ₹1,999 — Unlock Everything"}
        </button>

        <p className="sub-note">🔒 Secure payment via Razorpay · SSL encrypted · Refund within 14 days</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%" }} onClick={onClose}>Maybe later</button>
      </div>
    </div>
  );
}
