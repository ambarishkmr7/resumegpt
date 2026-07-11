import { Platform } from "react-native";
import RazorpayCheckout from "react-native-razorpay";
import { api } from "../api/client";
import type { CreateOrderResponse, Plan, RefillPack } from "../api/types";

const BRAND = {
  name: "resumesGPT",
  theme: { color: "#D97706" },
};

export interface PurchaseResult {
  status: "success" | "cancelled";
}

// react-native-razorpay is native-only (no web implementation) — RazorpayCheckout.open()
// silently fails on Expo web. On web we instead load Razorpay's own Checkout.js and drive
// `window.Razorpay`, mirroring frontend/src/components/SubscriptionModal.jsx exactly so the
// same backend create-order/verify-payment contract is reused on every platform.
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (resp: unknown) => void) => void;
    };
  }
}

function ensureRazorpayWeb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Payments aren't available in this environment."));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay.")));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

// One-time order (refill pack or non-recurring plan). Handles the ₹0
// free-coupon short-circuit — mirrors SubscriptionModal.jsx on the web.
export async function purchaseOrder(
  kind: "plan" | "refill",
  item: Plan | RefillPack,
  couponCode?: string,
): Promise<PurchaseResult> {
  const order = await api.createOrder({
    kind,
    target_id: item.id,
    coupon_code: couponCode,
  });
  if (order.free) return { status: "success" }; // activated server-side

  if (Platform.OS === "web") return purchaseOrderWeb(order, item);

  try {
    const resp = await RazorpayCheckout.open({
      key: order.razorpay_key_id!,
      amount: order.amount!,
      currency: order.currency || "INR",
      order_id: order.order_id!,
      name: BRAND.name,
      description: item.name,
      theme: BRAND.theme,
    });
    await api.verifyPayment({
      razorpay_order_id: resp.razorpay_order_id || order.order_id!,
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_signature: resp.razorpay_signature,
    });
    return { status: "success" };
  } catch (e) {
    if (isCancelled(e)) return { status: "cancelled" };
    throw normalizeRazorpayError(e);
  }
}

// Recurring subscription via Razorpay Subscriptions (or demo auto-activate).
export async function purchaseSubscription(plan: Plan): Promise<PurchaseResult> {
  const sub = await api.createSubscription(plan.id);
  if (sub.demo || sub.razorpay_key_id === "demo_mode") return { status: "success" };

  if (Platform.OS === "web") return purchaseSubscriptionWeb(sub, plan);

  try {
    const resp = await RazorpayCheckout.open({
      key: sub.razorpay_key_id!,
      subscription_id: sub.subscription_id!,
      name: BRAND.name,
      description: `${plan.name} — monthly`,
      theme: BRAND.theme,
    } as never);
    await api.verifyPayment({
      razorpay_payment_id: resp.razorpay_payment_id,
      razorpay_signature: resp.razorpay_signature,
      razorpay_subscription_id:
        (resp as { razorpay_subscription_id?: string }).razorpay_subscription_id ||
        sub.subscription_id!,
    });
    return { status: "success" };
  } catch (e) {
    if (isCancelled(e)) return { status: "cancelled" };
    throw normalizeRazorpayError(e);
  }
}

async function purchaseOrderWeb(
  order: CreateOrderResponse,
  item: Plan | RefillPack,
): Promise<PurchaseResult> {
  await ensureRazorpayWeb();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpay_key_id,
      amount: order.amount,
      currency: order.currency || "INR",
      name: BRAND.name,
      description: item.name,
      order_id: order.order_id,
      theme: BRAND.theme,
      handler: (resp: unknown) => {
        const r = resp as {
          razorpay_order_id?: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        };
        api
          .verifyPayment({
            razorpay_order_id: r.razorpay_order_id || order.order_id!,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          })
          .then(() => resolve({ status: "success" }))
          .catch(reject);
      },
      modal: { ondismiss: () => resolve({ status: "cancelled" }) },
    });
    rzp.on("payment.failed", (resp: unknown) => {
      const desc = (resp as { error?: { description?: string } })?.error?.description;
      reject(new Error(desc || "Payment failed."));
    });
    rzp.open();
  });
}

async function purchaseSubscriptionWeb(
  sub: { razorpay_key_id?: string; subscription_id?: string },
  plan: Plan,
): Promise<PurchaseResult> {
  await ensureRazorpayWeb();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: sub.razorpay_key_id,
      subscription_id: sub.subscription_id,
      name: BRAND.name,
      description: `${plan.name} — monthly`,
      theme: BRAND.theme,
      handler: (resp: unknown) => {
        const r = resp as {
          razorpay_subscription_id?: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        };
        api
          .verifyPayment({
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
            razorpay_subscription_id: r.razorpay_subscription_id || sub.subscription_id!,
          })
          .then(() => resolve({ status: "success" }))
          .catch(reject);
      },
      modal: { ondismiss: () => resolve({ status: "cancelled" }) },
    });
    rzp.on("payment.failed", (resp: unknown) => {
      const desc = (resp as { error?: { description?: string } })?.error?.description;
      reject(new Error(desc || "Payment failed."));
    });
    rzp.open();
  });
}

// The native SDK rejects with {code, description}; user-dismissal comes back
// as code 0 (Android) / "payment_cancelled" style descriptions.
function isCancelled(e: unknown): boolean {
  const err = e as { code?: number | string; description?: string };
  if (err?.code === 0 || err?.code === "0") return true;
  const desc = (err?.description || "").toLowerCase();
  return desc.includes("cancel");
}

function normalizeRazorpayError(e: unknown): Error {
  const err = e as { description?: string; message?: string };
  return new Error(err?.description || err?.message || "Payment failed.");
}
