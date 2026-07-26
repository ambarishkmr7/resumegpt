import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";

const card = {
  background: "#fff", border: "1px solid var(--line, #e2dccf)", borderRadius: 16,
  padding: 24, maxWidth: 640, margin: "0 auto",
};

function Row({ label, value, mono = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 16,
      padding: "10px 0", borderBottom: "1px solid var(--line, #e2dccf)",
    }}>
      <span style={{ color: "var(--ink-soft, #6b6258)", fontSize: 13 }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 600, textAlign: "right", wordBreak: "break-all",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
      }}>{value}</span>
    </div>
  );
}

export default function PaymentSuccess() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [status, setStatus] = useState(null); // subscription status after fulfilment
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.paymentReceipt(ref), api.subscriptionStatus().catch(() => null)])
      .then(([r, s]) => { if (!cancelled) { setReceipt(r); setStatus(s); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ref]);

  const downloadInvoice = useCallback(async () => {
    setDownloading(true); setDownloadErr("");
    try {
      const { blob } = await api.downloadInvoice(ref);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${receipt?.invoice_no || ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadErr(e.message || "Could not download the invoice.");
    } finally {
      setDownloading(false);
    }
  }, [ref, receipt]);

  const paid = receipt?.status === "paid";
  const amount = receipt ? `₹${Number(receipt.amount).toLocaleString("en-IN")}` : "";
  const when = receipt?.created_at ? new Date(receipt.created_at).toLocaleString() : null;
  // A mandate is an authorisation, not a purchase — nothing is charged today.
  const isMandate = receipt?.type === "mandate";
  const TYPE_LABELS = { subscription: "Monthly plan", refill: "Refill pack", mandate: "Auto-payment setup" };

  return (
    <>
      <Topbar />
      <section style={{ padding: "48px 20px 64px" }}>
        {loading ? (
          <div style={{ ...card, textAlign: "center", color: "var(--ink-soft, #6b6258)" }}>
            Confirming your payment…
          </div>
        ) : error ? (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>We couldn't load this payment</h2>
            <p style={{ color: "var(--ink-soft, #6b6258)" }}>{error}</p>
            <p style={{ color: "var(--ink-soft, #6b6258)", fontSize: 13 }}>
              If money left your account, it is safe — the payment is recorded on our side and
              the plan activates automatically. Check your billing history, or contact support
              with the payment ID from your bank SMS.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => navigate("/dashboard")}>Go to dashboard</button>
              <Link className="btn btn-ghost" to="/settings">Billing history</Link>
            </div>
          </div>
        ) : (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", margin: "0 auto 12px",
                background: paid ? "#dcfce7" : "#fef3c7",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
              }}>{paid ? "✅" : "⏳"}</div>
              <h1 style={{ margin: "0 0 6px", fontSize: 26 }}>
                {!paid ? "Payment is being confirmed"
                  : isMandate ? "Auto-payment is on" : "Payment successful"}
              </h1>
              <p style={{ color: "var(--ink-soft, #6b6258)", margin: 0 }}>
                {!paid
                  ? "Your bank has confirmed the debit. We're waiting on the gateway to confirm — this usually takes a few seconds."
                  : isMandate
                  ? `${receipt.plan_name || receipt.plan} will renew automatically. Nothing was charged today — the next payment happens when your current cycle ends.`
                  : `${amount} paid for ${receipt.plan_name || receipt.plan}. Your access is active.`}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <Row label="Invoice no." value={receipt.invoice_no} mono />
              <Row label="Item" value={receipt.plan_name || receipt.plan} />
              <Row label="Type" value={TYPE_LABELS[receipt.type] || receipt.type} />
              {receipt.discount_inr > 0 && (
                <>
                  <Row label="Price" value={`₹${Number(receipt.base_amount_inr).toLocaleString("en-IN")}`} />
                  <Row
                    label={receipt.coupon_code ? `Discount (${receipt.coupon_code})` : "Discount"}
                    value={`−₹${Number(receipt.discount_inr).toLocaleString("en-IN")}`}
                  />
                </>
              )}
              <Row label={isMandate ? "Charged today" : "Amount paid"} value={amount} />
              <Row label="Date" value={when} />
              <Row label="Payment ID" value={receipt.payment_id} mono />
              <Row label="Order ID" value={receipt.order_id} mono />
              <Row label="Status" value={(receipt.status || "").toUpperCase()} />
              {status?.is_subscribed && status.current_period_end && (
                <Row label="Plan active until" value={new Date(status.current_period_end).toLocaleDateString()} />
              )}
            </div>

            {downloadErr && <div className="error" style={{ marginBottom: 12 }}>{downloadErr}</div>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" style={{ flex: "1 1 200px" }}
                onClick={downloadInvoice} disabled={!paid || downloading}>
                {downloading ? "Preparing…" : "⬇ Download invoice (PDF)"}
              </button>
              <button className="btn btn-ghost" style={{ flex: "1 1 160px" }}
                onClick={() => navigate(params.get("next") || "/dashboard")}>
                Continue
              </button>
            </div>
            {!paid && (
              <p style={{ fontSize: 12, color: "var(--ink-soft, #6b6258)", marginTop: 12 }}>
                The invoice becomes available once the gateway confirms the payment. Refresh this
                page in a moment, or find it later under billing history.
              </p>
            )}
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
