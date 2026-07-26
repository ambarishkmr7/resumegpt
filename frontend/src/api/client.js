// Central API client. Reads the JWT from localStorage and attaches it.
import { clearUserScopedStorage } from "../utils/session";

export const BASE = import.meta.env.VITE_API_BASE || "";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Author auth uses a separate token so it never collides with user login.
function authorHeaders() {
  const token = localStorage.getItem("author_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Endpoints where a 401 means "those credentials are wrong", not "your session
// expired" — wiping the stored token there would log a user out just for
// mistyping a password on a second tab.
const PUBLIC_AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/login-json",
  "/api/auth/register",
  "/api/auth/admin-register",
  "/api/auth/google",
  "/api/auth/facebook",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/guest",
  "/api/author/login",
  "/api/author/register",
];

// A 401 on an authenticated endpoint means the token is expired/invalid/revoked.
// Drop it (and the cached user) immediately so the app falls back to the logged
// -out state instead of retrying every call with a dead token. AuthContext
// listens for the event and clears its React state; route guards then send the
// user to /login.
//
// Only 401 clears the session — 403 ("Admin access required") comes from a
// perfectly valid token that simply lacks permission.
function clearSessionOn401(url) {
  let path = url || "";
  try { path = new URL(url, window.location.origin).pathname; } catch (_) {}
  if (PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p))) return;

  if (path.startsWith("/api/author/")) {
    if (!localStorage.getItem("author_token")) return;
    localStorage.removeItem("author_token");
    window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { scope: "author" } }));
    return;
  }

  if (!localStorage.getItem("token") && !localStorage.getItem("user")) return;
  localStorage.removeItem("token");
  invalidateCache();  // every cached read belonged to the session that just died
  // Drop every cache tied to the person whose session just died — the same purge
  // a deliberate sign-out does.
  clearUserScopedStorage({ keepExpiredFlag: true });
  // Lets the login screen explain why the user landed back there.
  try { sessionStorage.setItem("session_expired", "1"); } catch (_) {}
  window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { scope: "user" } }));
}

// ── Request coalescing ────────────────────────────────────────────────────────
// One screen asks for the same GET several times over: the page itself, the
// Topbar's usage meter, AuthContext's avatar lookup, a modal — and React
// StrictMode runs every mount effect twice in dev. Navigating "/" → "/dashboard"
// mounts two pages that each want /resumes, /profile/me and /public/stats, so a
// single dashboard visit fired each of those four-plus times.
//
// These are all pure reads, so concurrent callers can share one response.
//
// Two levels, deliberately different:
//  - in-flight only (ttlMs 0) for anything user-specific that a mutation can
//    change. Nothing survives settlement, so a save is never masked.
//  - short TTL for public/static content (plan catalogue, CMS copy, template
//    list, marketing stats) so page-to-page navigation doesn't refetch it.
//
// Keys are prefixed by domain so a mutation can drop just its own group.
const _inflight = new Map();
const _cache = new Map();
const STATIC_TTL_MS = 60_000;   // admin-authored / public content
const CATALOGUE_TTL_MS = 5_000; // plans & refills: cheap to re-check, must feel live
// User data that two pages in a row both want. Short enough that a background
// change shows up almost immediately, and every mutation invalidates its group
// explicitly, so this never hides the user's own edits.
const USER_TTL_MS = 3_000;

function coalesce(key, run, { ttlMs = 0 } = {}) {
  if (ttlMs) {
    const hit = _cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
  }
  const pending = _inflight.get(key);
  if (pending) return pending;

  const p = run()
    .then((value) => {
      if (ttlMs) _cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

/** Drop cached reads whose key starts with `prefix` (no arg ⇒ everything). */
export function invalidateCache(prefix) {
  if (!prefix) { _cache.clear(); return; }
  for (const k of [..._cache.keys()]) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

// Anything that changes what the billing endpoints would answer must drop the
// catalogue cache, so a fresh purchase or plan edit is never served stale.
export function invalidateBillingCache() {
  invalidateCache("sub:");
}

async function handle(res) {
  if (!res.ok) {
    if (res.status === 401) clearSessionOn401(res.url);
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch (_) {}
    const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    // Callers need the status: the message is the server's prose ("Could not
    // validate credentials"), which can't be reliably parsed for a code.
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res;
}

export const api = {
  // ---- Auth ----
  register: (body) =>
    fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  googleLogin: (credential) =>
    fetch(`${BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    }).then(handle),

  facebookLogin: (accessToken) =>
    fetch(`${BASE}/api/auth/facebook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }).then(handle),

  login: (email, password) => {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    return fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    }).then(handle);
  },

  logout: () =>
    fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: authHeaders() }).then(handle),

  forgotPassword: (email) =>
    fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then(handle),

  resetPassword: (token, new_password) =>
    fetch(`${BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password }),
    }).then(handle),

  guestRegister: () =>
    fetch(`${BASE}/api/auth/guest`, { method: "POST" }).then(handle),

  claimGuest: (full_name, email, password) =>
    fetch(`${BASE}/api/auth/claim-guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ full_name, email, password }),
    }).then(handle),

  changePassword: (current_password, new_password) =>
    fetch(`${BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ current_password, new_password }),
    }).then(handle),

  me: () => coalesce("auth:me", () =>
    fetch(`${BASE}/api/auth/me`, { headers: authHeaders() }).then(handle)),

  // ---- Staff (/sys-admin) ----
  adminLoginJson: (email, password) =>
    fetch(`${BASE}/api/auth/login-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(handle),
  adminRegister: (body) =>
    fetch(`${BASE}/api/auth/admin-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),
  authorRegister: (body) =>
    fetch(`${BASE}/api/author/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  // ---- Templates ----
  templates: () => coalesce("static:templates", () =>
    fetch(`${BASE}/api/templates`).then(handle), { ttlMs: STATIC_TTL_MS }),

  // ---- Resumes ----
  listResumes: () => coalesce("resumes:list", () =>
    fetch(`${BASE}/api/resumes`, { headers: authHeaders() }).then(handle),
    { ttlMs: USER_TTL_MS }),

  // In-flight only: the editor autosaves, so this must never serve a settled
  // copy. Dedupe alone is enough to collapse the editor's double mount.
  getResume: (id) => coalesce(`resumes:one:${id}`, () =>
    fetch(`${BASE}/api/resumes/${id}`, { headers: authHeaders() }).then(handle)),

  // Every resume mutation drops the cached list, so the dashboard can never
  // show a stale set right after the user creates, edits or deletes one.
  createResume: (body) => {
    invalidateCache("resumes:");
    return fetch(`${BASE}/api/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },

  updateResume: (id, body) => {
    invalidateCache("resumes:");
    return fetch(`${BASE}/api/resumes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },

  deleteResume: (id) => {
    invalidateCache("resumes:");
    return fetch(`${BASE}/api/resumes/${id}`, { method: "DELETE", headers: authHeaders() })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) clearSessionOn401(res.url);
          const err = new Error("Delete failed");
          err.status = res.status;
          throw err;
        }
        return { ok: true };
      });
  },

  generateSample: (job_title, years_experience, name) =>
    fetch(`${BASE}/api/resumes/generate-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ job_title, years_experience, name }),
    }).then(handle),

  uploadResume: (file, title) => {
    invalidateCache("resumes:");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || "Imported Resume");
    return fetch(`${BASE}/api/resumes/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    }).then(handle);
  },

  parseReference: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/api/resumes/parse-reference`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    }).then(handle);
  },

  // A POST, but a pure scoring function of its body — identical concurrent
  // requests (the editor's double mount) can share one response. In-flight only,
  // keyed on the body, so a real edit always re-scores.
  ats: (content, job_description) => {
    const body = JSON.stringify({ content, job_description });
    return coalesce(`ats:${body}`, () =>
      fetch(`${BASE}/api/resumes/ats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body,
      }).then(handle));
  },

  suggest: (content, job_description) =>
    fetch(`${BASE}/api/resumes/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, job_description }),
    }).then(handle),

  coverLetter: (body) =>
    fetch(`${BASE}/api/resumes/cover-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  analyze: (content, job_description, resume_id) =>
    fetch(`${BASE}/api/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, job_description, resume_id }),
    }).then(handle),

  roadmap: (content, target_role, resume_id) =>
    fetch(`${BASE}/api/resumes/roadmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, target_role, resume_id }),
    }).then(handle),

  writeup: (content, purpose) =>
    fetch(`${BASE}/api/resumes/writeup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, purpose }),
    }).then(handle),

  rewrite: (content, job_description, num_variants = 3) =>
    fetch(`${BASE}/api/resumes/rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, job_description, num_variants }),
    }).then(handle),

  jobs: (content, target_role, location) =>
    fetch(`${BASE}/api/resumes/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, target_role, location }),
    }).then(handle),

  jobListings: (content, target_role, location, skills) =>
    fetch(`${BASE}/api/resumes/job-listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, target_role, location, skills }),
    }).then(handle),

  uploadPhoto: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/api/resumes/photo`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    return handle(res);
  },

  // Subscription
  subscriptionStatus: () =>
    coalesce("sub:status", () =>
      fetch(`${BASE}/api/subscription/status`, { headers: authHeaders() }).then(handle)),

  // Usage meters: interview minutes + AI-token % + daily resume-upload quota.
  usageSummary: () =>
    coalesce("sub:usage", () =>
      fetch(`${BASE}/api/subscription/usage`, { headers: authHeaders() }).then(handle)),

  // Dashboard nudges: recharge popup + personal loyalty coupon.
  subscriptionNudges: () =>
    coalesce("sub:nudges", () =>
      fetch(`${BASE}/api/subscription/nudges`, { headers: authHeaders() }).then(handle)),

  // Public catalogue — same answer for everyone, changes only on admin edits.
  plans: () =>
    coalesce("sub:plans", () =>
      fetch(`${BASE}/api/subscription/plans`, { headers: authHeaders() }).then(handle),
      { ttlMs: CATALOGUE_TTL_MS }),
  refillPacks: () =>
    coalesce("sub:refills", () =>
      fetch(`${BASE}/api/subscription/refill-packs`, { headers: authHeaders() }).then(handle),
      { ttlMs: CATALOGUE_TTL_MS }),

  validateCoupon: (code, kind, target_id) =>
    fetch(`${BASE}/api/subscription/coupon/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ code, kind, target_id }),
    }).then(handle),

  // kind: "plan" | "refill"; returns { order_id, amount(paise), razorpay_key_id, ... }
  createOrder: ({ kind, target_id, coupon_code }) =>
    fetch(`${BASE}/api/subscription/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ kind, target_id, coupon_code }),
    }).then(handle),

  // Recurring subscription (Razorpay Subscriptions API / demo auto-activate).
  createSubscription: (plan_id) =>
    fetch(`${BASE}/api/subscription/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ plan_id }),
    }).then(handle),

  // Turn the recurring mandate on/off for the active plan. Enabling answers
  // { requires_checkout: true, subscription_id, ... } — run Razorpay Checkout
  // with those, then verifyPayment().
  setAutoPay: (enabled) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/subscription/auto-pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ enabled }),
    }).then(handle);
  },

  verifyPayment: (data) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/subscription/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }).then(handle);
  },

  paymentHistory: () =>
    fetch(`${BASE}/api/subscription/payments`, { headers: authHeaders() }).then(handle),

  // `ref` may be our payment id, the Razorpay order id, or the Razorpay payment id.
  paymentReceipt: (ref) =>
    fetch(`${BASE}/api/subscription/payments/${encodeURIComponent(ref)}/receipt`, {
      headers: authHeaders(),
    }).then(handle),

  downloadInvoice: async (ref) => {
    const res = await fetch(`${BASE}/api/subscription/payments/${encodeURIComponent(ref)}/invoice`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) clearSessionOn401(res.url);
      let detail = "Invoice download failed";
      try { const d = await res.json(); detail = d.detail || detail; } catch (_) {}
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return { blob: await res.blob() };
  },

  // ---- Elite AI Features ----
  careerCounseling: (content, question, history = []) =>
    fetch(`${BASE}/api/resumes/career-counseling`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, question, history }),
    }).then(handle),

  mockInterview: (content, role, difficulty = "medium", question_count = 55) =>
    fetch(`${BASE}/api/resumes/mock-interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, role, difficulty, question_count }),
    }).then(handle),

  rateAnswer: (content, question, answer, role) =>
    fetch(`${BASE}/api/resumes/rate-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, question, answer, role }),
    }).then(handle),

  interviewMaterials: (content, role) =>
    fetch(`${BASE}/api/resumes/interview-materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, role }),
    }).then(handle),

  // ---- Live Audio Mock Interview ----
  // WebSocket URL for the live session (JWT passed as query param — browsers
  // can't set Authorization headers on a WebSocket).
  liveInterviewWsUrl: (resumeId) => {
    const token = localStorage.getItem("token") || "";
    const httpBase = BASE || window.location.origin;
    const wsBase = httpBase.replace(/^http/, "ws");
    return `${wsBase}/api/resumes/mock-interview-live/${resumeId}?token=${encodeURIComponent(token)}`;
  },

  listInterviewSessions: (resumeId) =>
    fetch(`${BASE}/api/resumes/interview-sessions${resumeId ? `?resume_id=${resumeId}` : ""}`, {
      headers: { ...authHeaders() },
    }).then(handle),

  getInterviewSession: (id) =>
    fetch(`${BASE}/api/resumes/interview-sessions/${id}`, {
      headers: { ...authHeaders() },
    }).then(handle),

  uploadInterviewAudio: (id, blob) => {
    const fd = new FormData();
    fd.append("file", blob, `interview-${id}.webm`);
    return fetch(`${BASE}/api/resumes/interview-sessions/${id}/audio`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: fd,
    }).then(handle);
  },

  // Direct, seekable URL for an <audio> element — the backend supports HTTP
  // Range requests, so the browser streams/buffers progressively and can seek
  // without downloading the whole recording. Token goes as a query param since
  // <audio src> can't set an Authorization header.
  interviewAudioStreamUrl: (id) => {
    const token = localStorage.getItem("token") || "";
    return `${BASE}/api/resumes/interview-sessions/${id}/audio?token=${encodeURIComponent(token)}`;
  },

  deleteInterviewSession: (id) =>
    fetch(`${BASE}/api/resumes/interview-sessions/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    }).then(handle),

  jobAgent: (content, target_role, location) =>
    fetch(`${BASE}/api/resumes/job-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, target_role, location }),
    }).then(handle),

  sendOtp: (mobile) =>
    fetch(`${BASE}/api/resumes/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ mobile }),
    }).then(handle),

  verifyOtp: (mobile, otp) =>
    fetch(`${BASE}/api/resumes/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ mobile, otp }),
    }).then(handle),

  sendEmailOtp: (email) =>
    fetch(`${BASE}/api/resumes/send-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ email }),
    }).then(handle),

  verifyEmailOtp: (email, otp) =>
    fetch(`${BASE}/api/resumes/verify-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ email, otp }),
    }).then(handle),

  downloadUrl: (id, fmt) => `${BASE}/api/resumes/${id}/download?fmt=${fmt}`,

  // download needs the auth header; returns {blob} or {needsSub:true}
  download: async (id, fmt) => {
    const res = await fetch(`${BASE}/api/resumes/${id}/download?fmt=${fmt}`, {
      headers: authHeaders(),
    });
    if (res.status === 402) return { needsSub: true };
    if (!res.ok) {
      if (res.status === 401) clearSessionOn401(res.url);
      const err = new Error("Download failed");
      err.status = res.status;
      throw err;
    }
    return { blob: await res.blob() };
  },

  // Fetch the originally-uploaded file as a blob (for "view as uploaded" mode).
  // The uploaded file is fixed for the life of a resume, so re-downloading it
  // per mount is pure waste — this was fetching the same PDF twice on every
  // editor open. Blobs are immutable, so callers can safely share one.
  fetchOriginal: (id) => coalesce(`resumes:original:${id}`, async () => {
    const res = await fetch(`${BASE}/api/resumes/${id}/original`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) clearSessionOn401(res.url);
      return null;
    }
    const blob = await res.blob();
    return { blob, type: res.headers.get("content-type") || "application/pdf" };
  }, { ttlMs: USER_TTL_MS }),

  // ---- Admin ----
  adminDashboard: () =>
    fetch(`${BASE}/api/admin/dashboard`, { headers: authHeaders() }).then(handle),
  adminCmsPages: () =>
    fetch(`${BASE}/api/admin/cms`, { headers: authHeaders() }).then(handle),
  // Public CMS copy is cached for a minute — an admin saving an edit must see
  // it on the site right away, not after the TTL lapses.
  adminUpdateCms: (slug, body) => {
    invalidateCache("static:cms:");
    return fetch(`${BASE}/api/admin/cms/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },
  makeAdmin: () =>
    fetch(`${BASE}/api/admin/make-admin`, { method: "POST", headers: authHeaders() }).then(handle),
  adminPayments: ({ page = 1, page_size = 20, status = "", type = "" } = {}) => {
    const p = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (status) p.set("status", status);
    if (type) p.set("type", type);
    return fetch(`${BASE}/api/admin/payments?${p}`, { headers: authHeaders() }).then(handle);
  },

  // ---- Admin: LLM Usage ----
  adminLlmUsageSummary: (days = 30) =>
    fetch(`${BASE}/api/admin/llm-usage/summary?days=${days}`, { headers: authHeaders() }).then(handle),
  adminLlmUsageByUser: (days = 30, page = 1, page_size = 20) =>
    fetch(`${BASE}/api/admin/llm-usage/by-user?days=${days}&page=${page}&page_size=${page_size}`, { headers: authHeaders() }).then(handle),
  adminLlmUsageLogs: ({ days = 7, purpose = "", provider = "", userId = "", page = 1, page_size = 50 } = {}) => {
    const params = new URLSearchParams({ days: String(days), page: String(page), page_size: String(page_size) });
    if (purpose) params.set("purpose", purpose);
    if (provider) params.set("provider", provider);
    if (userId) params.set("user_id", userId);
    return fetch(`${BASE}/api/admin/llm-usage/logs?${params.toString()}`, { headers: authHeaders() }).then(handle);
  },

  // ---- Admin: Billing (plans, refills, coupons, subs, usage, settings, P&L) ----
  adminUsers: ({ page = 1, page_size = 20, q = "" } = {}) => {
    const p = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (q) p.set("q", q);
    return fetch(`${BASE}/api/admin/users?${p}`, { headers: authHeaders() }).then(handle);
  },
  adminPlans: ({ page = 1, page_size = 50 } = {}) =>
    fetch(`${BASE}/api/admin/plans?page=${page}&page_size=${page_size}`, { headers: authHeaders() }).then(handle),
  // Plan/refill edits change the public catalogue — drop its cache so the
  // pricing grid reflects the edit immediately rather than up to a tick later.
  adminSavePlan: (id, body) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/admin/plans${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },
  adminDeletePlan: (id) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/admin/plans/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle);
  },

  adminRefills: ({ page = 1, page_size = 50 } = {}) =>
    fetch(`${BASE}/api/admin/refill-packs?page=${page}&page_size=${page_size}`, { headers: authHeaders() }).then(handle),
  adminSaveRefill: (id, body) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/admin/refill-packs${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },
  adminDeleteRefill: (id) => {
    invalidateBillingCache();
    return fetch(`${BASE}/api/admin/refill-packs/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle);
  },

  adminCoupons: ({ page = 1, page_size = 20 } = {}) =>
    fetch(`${BASE}/api/admin/coupons?page=${page}&page_size=${page_size}`, { headers: authHeaders() }).then(handle),
  adminSaveCoupon: (id, body) =>
    fetch(`${BASE}/api/admin/coupons${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  adminDeleteCoupon: (id) =>
    fetch(`${BASE}/api/admin/coupons/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  adminSubscriptions: ({ page = 1, page_size = 20, status = "" } = {}) => {
    const p = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (status) p.set("status", status);
    return fetch(`${BASE}/api/admin/subscriptions?${p}`, { headers: authHeaders() }).then(handle);
  },
  adminGrantSubscription: (user_email, plan_id) =>
    fetch(`${BASE}/api/admin/subscriptions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ user_email, plan_id }),
    }).then(handle),
  adminUsage: ({ page = 1, page_size = 20, q = "" } = {}) => {
    const p = new URLSearchParams({ page: String(page), page_size: String(page_size) });
    if (q) p.set("q", q);
    return fetch(`${BASE}/api/admin/usage?${p}`, { headers: authHeaders() }).then(handle);
  },
  // body: { minutes } for interview accounts, { tokens } for llm_tokens accounts.
  adminAdjustUsage: (userId, body) =>
    fetch(`${BASE}/api/admin/usage/${userId}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  adminSettings: () =>
    fetch(`${BASE}/api/admin/settings`, { headers: authHeaders() }).then(handle),
  adminSaveSettings: (body) =>
    fetch(`${BASE}/api/admin/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  adminProfitLoss: (days = 30) =>
    fetch(`${BASE}/api/admin/profit-loss?days=${days}`, { headers: authHeaders() }).then(handle),

  // ---- Public CMS ----
  trendingJobs: (resumeContent) =>
    fetch(`${BASE}/api/resumes/trending-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content: resumeContent }),
    }).then(handle),

  // Public, identical for every visitor and only changed by an admin edit —
  // safe to hold briefly so moving between pages doesn't refetch it.
  getPublicStats: () =>
    coalesce("static:stats", () =>
      fetch(`${BASE}/api/admin/public/stats`).then(handle), { ttlMs: STATIC_TTL_MS }),

  getCmsPage: (slug) =>
    coalesce(`static:cms:${slug}`, () =>
      fetch(`${BASE}/api/admin/public/cms/${slug}`).then(handle), { ttlMs: STATIC_TTL_MS }),
  listCmsPages: () =>
    coalesce("static:cms:__list", () =>
      fetch(`${BASE}/api/admin/public/cms`).then(handle), { ttlMs: STATIC_TTL_MS }),
  getSubscriptionPage: () =>
    coalesce("static:cms:subscription", () =>
      fetch(`${BASE}/api/admin/public/cms/subscription`).then(handle), { ttlMs: STATIC_TTL_MS }),
  // Homepage subscription panel content — sourced from cms_pages record 'cms_sub'.
  getSubscriptionContent: () =>
    coalesce("static:cms:cms_sub", () =>
      fetch(`${BASE}/api/admin/public/cms/cms_sub`).then(handle), { ttlMs: STATIC_TTL_MS }),


  // ---- Profile ----
  getProfile: () =>
    coalesce("profile:me", () =>
      fetch(`${BASE}/api/profile/me`, { headers: authHeaders() }).then(handle),
      { ttlMs: USER_TTL_MS }),

  updateProfile: (body) => {
    invalidateCache("profile:");
    return fetch(`${BASE}/api/profile/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle);
  },

  uploadProfilePhoto: (file) => {
    invalidateCache("profile:");
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/api/profile/photo`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    }).then(handle);
  },

  // ---- Generic HTTP helpers ----
  get: (url) => fetch(`${BASE}${url}`, { headers: authHeaders() }).then(handle),
  post: (url, body) =>
    fetch(`${BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  put: (url, body) =>
    fetch(`${BASE}${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  delete: (url) =>
    fetch(`${BASE}${url}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  // ---- Authors (public) ----
  listAuthors: () => fetch(`${BASE}/api/authors`).then(handle),
  getAuthor: (slug) => fetch(`${BASE}/api/authors/${slug}`).then(handle),

  // ---- Author auth + content ----
  authorLogin: (email, password) =>
    fetch(`${BASE}/api/author/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(handle),
  authorLogout: () => localStorage.removeItem("author_token"),
  authorMe: () => fetch(`${BASE}/api/author/me`, { headers: authorHeaders() }).then(handle),
  authorUpdateProfile: (body) =>
    fetch(`${BASE}/api/author/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authorHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  authorChangePassword: (current_password, new_password) =>
    fetch(`${BASE}/api/author/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorHeaders() },
      body: JSON.stringify({ current_password, new_password }),
    }).then(handle),
  authorListPosts: () =>
    fetch(`${BASE}/api/author/posts`, { headers: authorHeaders() }).then(handle),
  authorCreatePost: (body) =>
    fetch(`${BASE}/api/author/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  authorUpdatePost: (id, body) =>
    fetch(`${BASE}/api/author/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authorHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  authorDeletePost: (id) =>
    fetch(`${BASE}/api/author/posts/${id}`, { method: "DELETE", headers: authorHeaders() }).then(handle),
};
