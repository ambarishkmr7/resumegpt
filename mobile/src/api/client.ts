// Central API client — port of frontend/src/api/client.js (v1 mobile subset).
// The JWT lives in the auth store (memory) and is mirrored to SecureStore.
import { BASE, wsBase } from "./base";
import type {
  AdminCoupon,
  AdminCouponInput,
  AdminPayment,
  AdminPlan,
  AdminPlanInput,
  AdminRefillInput,
  AdminRefillPack,
  AdminSettings,
  AdminSubscription,
  AdminUsageRow,
  AdminUser,
  CmsPage,
  DashboardStats,
  LlmUsageSummary,
  Paginated,
  ProfitLoss,
} from "./adminTypes";
import { ApiError, PaymentRequiredError } from "./errors";
import type {
  AgentChatResponse,
  AgentConversationDetail,
  AgentConversationSummary,
  AtsResult,
  AuthResponse,
  CareerAnalysis,
  CareerRoadmap,
  SuggestResponse,
  CouponInfo,
  CreateOrderResponse,
  CreateSubscriptionResponse,
  InterviewSessionDetail,
  InterviewSessionSummary,
  JobListingsResponse,
  PaymentRecord,
  Plan,
  Profile,
  ProfileUpdate,
  RefillPack,
  Resume,
  ResumeContent,
  ResumeTemplate,
  SubscriptionStatus,
  UsageSummary,
  User,
} from "./types";

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

// Wired up once by the auth store to avoid an import cycle.
export function configureAuth(opts: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: unknown = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && getToken()) onUnauthorized();
    if (res.status === 402) throw new PaymentRequiredError(detail);
    throw new ApiError(
      res.status,
      typeof detail === "string" ? detail : JSON.stringify(detail),
    );
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json")
    ? res.json()
    : (res as unknown as T);
}

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: authHeaders() }).then((r) =>
    handle<T>(r),
  );
}

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

function multipart<T>(
  path: string,
  file: PickedFile,
  extra?: Record<string, string>,
): Promise<T> {
  const fd = new FormData();
  // React Native FormData file part: {uri, name, type}.
  fd.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
  for (const [k, v] of Object.entries(extra || {})) fd.append(k, v);
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(), // no manual Content-Type — RN sets the boundary
    body: fd,
  }).then((r) => handle<T>(r));
}

export const api = {
  // ---- Auth ----
  register: (body: { email: string; password: string; full_name?: string }) =>
    send<AuthResponse>("POST", "/api/auth/register", body),

  login: (email: string, password: string) =>
    send<AuthResponse>("POST", "/api/auth/login-json", { email, password }),

  googleLogin: (credential: string) =>
    send<AuthResponse>("POST", "/api/auth/google", { credential }),

  guestRegister: () => send<AuthResponse>("POST", "/api/auth/guest"),

  claimGuest: (full_name: string, email: string, password: string) =>
    send<AuthResponse>("POST", "/api/auth/claim-guest", {
      full_name,
      email,
      password,
    }),

  logout: () => send<unknown>("POST", "/api/auth/logout"),

  forgotPassword: (email: string) =>
    send<unknown>("POST", "/api/auth/forgot-password", { email }),

  resetPassword: (token: string, new_password: string) =>
    send<unknown>("POST", "/api/auth/reset-password", { token, new_password }),

  changePassword: (current_password: string, new_password: string) =>
    send<unknown>("POST", "/api/auth/change-password", {
      current_password,
      new_password,
    }),

  me: () => get<User>("/api/auth/me"),

  // ---- Templates ----
  templates: () => get<ResumeTemplate[]>("/api/templates"),

  // ---- Resumes ----
  listResumes: () => get<Resume[]>("/api/resumes"),
  getResume: (id: string) => get<Resume>(`/api/resumes/${id}`),
  createResume: (body: {
    title: string;
    template_id?: string;
    content?: ResumeContent;
  }) => send<Resume>("POST", "/api/resumes", body),
  updateResume: (id: string, body: Partial<Resume>) =>
    send<Resume>("PUT", `/api/resumes/${id}`, body),
  deleteResume: (id: string) =>
    fetch(`${BASE}/api/resumes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((res) => {
      if (!res.ok) throw new ApiError(res.status, "Delete failed");
      return { ok: true };
    }),

  generateSample: (job_title: string, years_experience: number, name: string) =>
    send<{ content: ResumeContent }>("POST", "/api/resumes/generate-sample", {
      job_title,
      years_experience,
      name,
    }),

  uploadResume: (file: PickedFile, title?: string) =>
    multipart<Resume>("/api/resumes/upload", file, {
      title: title || "Imported Resume",
    }),

  uploadPhoto: (file: PickedFile) =>
    multipart<{ photo?: string; data_url?: string }>(
      "/api/resumes/photo",
      file,
    ),

  // ---- AI tools ----
  ats: (content: ResumeContent, job_description?: string) =>
    send<AtsResult>("POST", "/api/resumes/ats", { content, job_description }),

  suggest: (content: ResumeContent, job_description?: string) =>
    send<SuggestResponse>("POST", "/api/resumes/suggest", {
      content,
      job_description,
    }),

  coverLetter: (body: {
    content: ResumeContent;
    job_title?: string;
    company?: string;
    job_description?: string;
    tone?: string;
  }) => send<{ cover_letter: string }>("POST", "/api/resumes/cover-letter", body),

  analyze: (content: ResumeContent, job_description?: string, resume_id?: string) =>
    send<CareerAnalysis>("POST", "/api/resumes/analyze", {
      content,
      job_description,
      resume_id,
    }),

  roadmap: (content: ResumeContent, target_role?: string, resume_id?: string) =>
    send<CareerRoadmap>("POST", "/api/resumes/roadmap", {
      content,
      target_role,
      resume_id,
    }),

  jobListings: (
    content: ResumeContent | null,
    target_role?: string,
    location?: string | null,
    skills?: string[],
  ) =>
    send<JobListingsResponse>("POST", "/api/resumes/job-listings", {
      content,
      target_role,
      location,
      skills,
    }),

  // ---- Downloads ----
  download: async (
    id: string,
    fmt: "pdf" | "docx",
  ): Promise<{ needsSub: true } | { res: Response }> => {
    const res = await fetch(`${BASE}/api/resumes/${id}/download?fmt=${fmt}`, {
      headers: authHeaders(),
    });
    if (res.status === 402) return { needsSub: true };
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    return { res };
  },

  downloadUrl: (id: string, fmt: "pdf" | "docx") =>
    `${BASE}/api/resumes/${id}/download?fmt=${fmt}`,

  // ---- Subscription / billing ----
  subscriptionStatus: () =>
    get<SubscriptionStatus>("/api/subscription/status"),
  usageSummary: () => get<UsageSummary>("/api/subscription/usage"),
  plans: () => get<{ plans: Plan[] }>("/api/subscription/plans"),
  refillPacks: () =>
    get<{ refill_packs: RefillPack[] }>("/api/subscription/refill-packs"),

  validateCoupon: (code: string, kind: "plan" | "refill", target_id: string) =>
    send<CouponInfo>("POST", "/api/subscription/coupon/validate", {
      code,
      kind,
      target_id,
    }),

  createOrder: (body: {
    kind: "plan" | "refill";
    target_id: string;
    coupon_code?: string;
  }) => send<CreateOrderResponse>("POST", "/api/subscription/create-order", body),

  createSubscription: (plan_id: string) =>
    send<CreateSubscriptionResponse>(
      "POST",
      "/api/subscription/create-subscription",
      { plan_id },
    ),

  verifyPayment: (data: {
    razorpay_payment_id: string;
    razorpay_signature: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
  }) => send<SubscriptionStatus>("POST", "/api/subscription/verify-payment", data),

  paymentHistory: () => get<PaymentRecord[]>("/api/subscription/payments"),

  // ---- Live interview ----
  liveInterviewWsUrl: (resumeId: string) => {
    const token = getToken() || "";
    return `${wsBase()}/api/resumes/mock-interview-live/${resumeId}?token=${encodeURIComponent(token)}`;
  },

  listInterviewSessions: (resumeId?: string) =>
    get<InterviewSessionSummary[]>(
      `/api/resumes/interview-sessions${resumeId ? `?resume_id=${resumeId}` : ""}`,
    ),

  getInterviewSession: (id: string) =>
    get<InterviewSessionDetail>(`/api/resumes/interview-sessions/${id}`),

  deleteInterviewSession: (id: string) =>
    fetch(`${BASE}/api/resumes/interview-sessions/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((r) => handle<unknown>(r)),

  uploadInterviewAudio: (id: string, file: PickedFile) =>
    multipart<unknown>(`/api/resumes/interview-sessions/${id}/audio`, file),

  // Seekable stream URL for the report screen's audio player (token as query
  // param — native players can't set an Authorization header).
  interviewAudioStreamUrl: (id: string) => {
    const token = getToken() || "";
    return `${BASE}/api/resumes/interview-sessions/${id}/audio?token=${encodeURIComponent(token)}`;
  },

  // ---- Career agent chat ----
  agentChat: (message: string, thread_id?: string | null) =>
    send<AgentChatResponse>("POST", "/api/agent/chat", { message, thread_id }),

  agentConversations: () =>
    get<{ conversations: AgentConversationSummary[] }>("/api/agent/conversations"),

  agentConversation: (threadId: string) =>
    get<AgentConversationDetail>(`/api/agent/conversations/${threadId}`),

  deleteAgentConversation: (threadId: string) =>
    send<{ success: boolean }>("DELETE", `/api/agent/conversations/${threadId}`),

  // ---- Profile ----
  getProfile: () => get<Profile>("/api/profile/me"),
  updateProfile: (body: ProfileUpdate) =>
    send<Profile>("PUT", "/api/profile/me", body),
  uploadProfilePhoto: (file: PickedFile) =>
    multipart<{ profile_photo_key: string }>("/api/profile/photo", file),
  profilePhotoUrl: (key: string) =>
    `${BASE}/api/profile/photo?key=${encodeURIComponent(key)}`,

  // ---- Admin (requires user.is_admin — reuses the same user token) ----
  adminDashboard: () => get<DashboardStats>("/api/admin/dashboard"),

  adminUsers: (page = 1, q?: string) =>
    get<Paginated<AdminUser>>(
      `/api/admin/users?page=${page}&page_size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),

  adminPayments: (page = 1, status?: string, type?: string) =>
    get<Paginated<AdminPayment>>(
      `/api/admin/payments?page=${page}&page_size=20${status ? `&status=${status}` : ""}${type ? `&type=${type}` : ""}`,
    ),

  adminCmsPages: () => get<CmsPage[]>("/api/admin/cms"),
  adminUpdateCms: (slug: string, body: Partial<Pick<CmsPage, "title" | "content" | "icon">>) =>
    send<CmsPage>("PUT", `/api/admin/cms/${slug}`, body),

  adminPlans: (page = 1) => get<Paginated<AdminPlan>>(`/api/admin/plans?page=${page}&page_size=50`),
  adminCreatePlan: (body: AdminPlanInput) => send<AdminPlan>("POST", "/api/admin/plans", body),
  adminUpdatePlan: (id: string, body: AdminPlanInput) =>
    send<AdminPlan>("PUT", `/api/admin/plans/${id}`, body),
  adminDeletePlan: (id: string) =>
    send<{ status: string }>("DELETE", `/api/admin/plans/${id}`),

  adminRefillPacks: (page = 1) =>
    get<Paginated<AdminRefillPack>>(`/api/admin/refill-packs?page=${page}&page_size=50`),
  adminCreateRefillPack: (body: AdminRefillInput) =>
    send<AdminRefillPack>("POST", "/api/admin/refill-packs", body),
  adminUpdateRefillPack: (id: string, body: AdminRefillInput) =>
    send<AdminRefillPack>("PUT", `/api/admin/refill-packs/${id}`, body),
  adminDeleteRefillPack: (id: string) =>
    send<{ status: string }>("DELETE", `/api/admin/refill-packs/${id}`),

  adminCoupons: (page = 1) => get<Paginated<AdminCoupon>>(`/api/admin/coupons?page=${page}&page_size=50`),
  adminCreateCoupon: (body: AdminCouponInput) => send<AdminCoupon>("POST", "/api/admin/coupons", body),
  adminUpdateCoupon: (id: string, body: AdminCouponInput) =>
    send<AdminCoupon>("PUT", `/api/admin/coupons/${id}`, body),
  adminDeleteCoupon: (id: string) =>
    send<{ status: string }>("DELETE", `/api/admin/coupons/${id}`),

  adminSubscriptions: (page = 1, status?: string) =>
    get<Paginated<AdminSubscription>>(
      `/api/admin/subscriptions?page=${page}&page_size=20${status ? `&status=${status}` : ""}`,
    ),
  adminGrantSubscription: (user_email: string, plan_id: string) =>
    send<{ status: string; user_email: string; plan: string }>(
      "POST",
      "/api/admin/subscriptions/grant",
      { user_email, plan_id },
    ),

  adminUsage: (page = 1, q?: string) =>
    get<Paginated<AdminUsageRow>>(
      `/api/admin/usage?page=${page}&page_size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
  adminAdjustUsage: (userId: string, minutes: number) =>
    send<{ user_id: string; available_seconds: number; available_minutes: number }>(
      "POST",
      `/api/admin/usage/${userId}/adjust`,
      { minutes },
    ),

  adminSettings: () => get<AdminSettings>("/api/admin/settings"),
  adminUpdateSettings: (body: Partial<AdminSettings>) =>
    send<AdminSettings>("PUT", "/api/admin/settings", body),

  adminLlmUsageSummary: (days = 30) =>
    get<LlmUsageSummary>(`/api/admin/llm-usage/summary?days=${days}`),

  adminProfitLoss: (days = 30) => get<ProfitLoss>(`/api/admin/profit-loss?days=${days}`),

  adminMakeAdmin: () => send<{ message: string }>("POST", "/api/admin/make-admin"),
};
