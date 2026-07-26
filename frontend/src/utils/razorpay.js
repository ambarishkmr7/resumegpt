// Lazily loads the Razorpay Checkout script. Shared by the purchase modal and
// the auto-payment toggle so both go through the same (single) script load.
export async function ensureRazorpay() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
