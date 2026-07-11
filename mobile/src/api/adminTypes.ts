// Mirrors backend/app/admin/router.py + billing.py response/request shapes.

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DashboardStats {
  total_users: number;
  total_subscribers: number;
  elite_subscribers: number;
  total_resumes: number;
  total_visitors: number;
  users_not_subscribed: number;
  total_revenue: number;
  recent_users: { id: string; email: string; name?: string; date?: string }[];
  recent_subscribers: { id: string; user_id: string; plan: string; amount: number; date?: string }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  is_admin: boolean;
  is_subscribed: boolean;
  created_at?: string;
}

export interface AdminPayment {
  id: string;
  user_id: string;
  user_email: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  created_at?: string;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  icon: string;
  updated_at?: string | null;
}

export interface AdminPlan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_inr: number;
  currency: string;
  billing_interval: string;
  interview_minutes: number;
  features: string[];
  badge?: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
  created_at?: string;
}

export interface AdminPlanInput {
  slug?: string;
  name: string;
  description?: string;
  price_inr: number;
  interview_minutes: number;
  features: string[];
  badge?: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
}

export interface AdminRefillPack {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_inr: number;
  amount_minutes: number;
  bonus_minutes: number;
  is_active: boolean;
  display_order: number;
}

export interface AdminRefillInput {
  slug?: string;
  name: string;
  description?: string;
  price_inr: number;
  amount_minutes: number;
  bonus_minutes: number;
  is_active: boolean;
  display_order: number;
}

export interface AdminCoupon {
  id: string;
  code: string;
  description?: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  applies_to: "all" | "plan" | "refill";
  min_amount_inr: number;
  max_redemptions?: number | null;
  redeemed_count: number;
  per_user_limit: number;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface AdminCouponInput {
  code: string;
  description?: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  applies_to: "all" | "plan" | "refill";
  min_amount_inr: number;
  max_redemptions?: number | null;
  per_user_limit: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active: boolean;
}

export interface AdminSubscription {
  id: string;
  user_id: string;
  user_email: string;
  plan: string;
  plan_name: string;
  status: string;
  amount: number;
  interval: string;
  razorpay_subscription_id?: string;
  current_period_end?: string;
  created_at?: string;
}

export interface AdminUsageRow {
  user_id: string;
  user_email: string;
  resource_type: string;
  source: string;
  allowance_seconds: number;
  used_seconds: number;
  refill_seconds: number;
  available_seconds: number;
  available_minutes: number;
  cycle_end?: string;
}

export interface AdminSettings {
  free_trial_interview_seconds: number;
  usd_to_inr_rate: number;
  interview_hard_cap_seconds: number;
  [k: string]: unknown;
}

export interface LlmUsageSummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  currency: string;
  by_purpose: { purpose: string; calls: number; tokens: number; cost_usd: number }[];
  by_provider: { provider: string; calls: number; tokens: number; cost_usd: number }[];
  daily: { date: string; calls: number; cost_usd: number }[];
}

export interface ProfitLoss {
  days: number;
  usd_to_inr_rate: number;
  revenue_inr: number;
  refunds_inr: number;
  net_revenue_inr: number;
  cost_usd: number;
  cost_inr: number;
  gross_profit_inr: number;
  margin_pct: number;
  revenue_by_type: { type: string; count: number; revenue_inr: number }[];
  per_plan: { plan_id: string; plan_name: string; count: number; revenue_inr: number }[];
  loss_making_users: { user_id: string; user_email: string; cost_inr: number; revenue_inr: number; net_inr: number }[];
  daily: { date: string; revenue_inr: number; cost_inr: number }[];
  suggestions: string[];
}

// ---- Author CMS ----
export interface AuthorPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  status: string; // "draft" | "published"
  published_at?: string;
  updated_at?: string;
}

export interface AuthorProfile {
  id: string;
  slug: string;
  name: string;
  role?: string;
  bio?: string;
  credentials?: string;
  avatar_url?: string;
  linkedin_url?: string;
  posts: AuthorPost[];
}
