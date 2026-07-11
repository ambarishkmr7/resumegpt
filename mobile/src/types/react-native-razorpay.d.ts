declare module "react-native-razorpay" {
  export interface CheckoutOptions {
    key: string;
    amount?: number; // paise
    currency?: string;
    order_id?: string;
    subscription_id?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: { email?: string; contact?: string; name?: string };
    theme?: { color?: string };
    [k: string]: unknown;
  }

  export interface CheckoutSuccess {
    razorpay_payment_id: string;
    razorpay_signature: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
  }

  const RazorpayCheckout: {
    open(options: CheckoutOptions): Promise<CheckoutSuccess>;
  };
  export default RazorpayCheckout;
}
