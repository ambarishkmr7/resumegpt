// Central API client. Reads the JWT from localStorage and attaches it.
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

async function handle(res) {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch (_) {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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

  me: () => fetch(`${BASE}/api/auth/me`, { headers: authHeaders() }).then(handle),

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
  templates: () => fetch(`${BASE}/api/templates`).then(handle),

  // ---- Resumes ----
  listResumes: () => fetch(`${BASE}/api/resumes`, { headers: authHeaders() }).then(handle),

  getResume: (id) => fetch(`${BASE}/api/resumes/${id}`, { headers: authHeaders() }).then(handle),

  createResume: (body) =>
    fetch(`${BASE}/api/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  updateResume: (id, body) =>
    fetch(`${BASE}/api/resumes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  deleteResume: (id) =>
    fetch(`${BASE}/api/resumes/${id}`, { method: "DELETE", headers: authHeaders() })
      .then((res) => { if (!res.ok) throw new Error("Delete failed"); return { ok: true }; }),

  generateSample: (job_title, years_experience, name) =>
    fetch(`${BASE}/api/resumes/generate-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ job_title, years_experience, name }),
    }).then(handle),

  uploadResume: (file, title) => {
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

  ats: (content, job_description) =>
    fetch(`${BASE}/api/resumes/ats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, job_description }),
    }).then(handle),

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
    fetch(`${BASE}/api/subscription/status`, { headers: authHeaders() }).then(handle),

  createOrder: (plan) =>
    fetch(`${BASE}/api/subscription/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ plan }),
    }).then(handle),

  verifyPayment: (data) =>
    fetch(`${BASE}/api/subscription/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }).then(handle),

  checkout: (payment_id, plan = "elite") =>
    fetch(`${BASE}/api/subscription/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ payment_id, plan }),
    }).then(handle),

  paymentHistory: () =>
    fetch(`${BASE}/api/subscription/payments`, { headers: authHeaders() }).then(handle),

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

  // Fetch the recording as an authenticated blob and return an object URL.
  interviewAudioObjectUrl: async (id) => {
    const res = await fetch(`${BASE}/api/resumes/interview-sessions/${id}/audio`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) throw new Error(`Could not load recording (${res.status})`);
    return URL.createObjectURL(await res.blob());
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
    if (!res.ok) throw new Error("Download failed");
    return { blob: await res.blob() };
  },

  // Fetch the originally-uploaded file as a blob (for "view as uploaded" mode).
  fetchOriginal: async (id) => {
    const res = await fetch(`${BASE}/api/resumes/${id}/original`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, type: res.headers.get("content-type") || "application/pdf" };
  },

  // ---- Admin ----
  adminDashboard: () =>
    fetch(`${BASE}/api/admin/dashboard`, { headers: authHeaders() }).then(handle),
  adminCmsPages: () =>
    fetch(`${BASE}/api/admin/cms`, { headers: authHeaders() }).then(handle),
  adminUpdateCms: (slug, body) =>
    fetch(`${BASE}/api/admin/cms/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),
  makeAdmin: () =>
    fetch(`${BASE}/api/admin/make-admin`, { method: "POST", headers: authHeaders() }).then(handle),
  adminPayments: () =>
    fetch(`${BASE}/api/admin/payments`, { headers: authHeaders() }).then(handle),

  // ---- Public CMS ----
  trendingJobs: (resumeContent) =>
    fetch(`${BASE}/api/resumes/trending-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content: resumeContent }),
    }).then(handle),

  getPublicStats: () =>
    fetch(`${BASE}/api/admin/public/stats`).then(handle),

  getCmsPage: (slug) =>
    fetch(`${BASE}/api/admin/public/cms/${slug}`).then(handle),
  listCmsPages: () =>
    fetch(`${BASE}/api/admin/public/cms`).then(handle),
  getSubscriptionPage: () =>
    fetch(`${BASE}/api/admin/public/cms/subscription`).then(handle),
  // Homepage subscription panel content — sourced from cms_pages record 'cms_sub'.
  getSubscriptionContent: () =>
    fetch(`${BASE}/api/admin/public/cms/cms_sub`).then(handle),


  // ---- Profile ----
  getProfile: () =>
    fetch(`${BASE}/api/profile/me`, { headers: authHeaders() }).then(handle),

  updateProfile: (body) =>
    fetch(`${BASE}/api/profile/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle),

  uploadProfilePhoto: (file) => {
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
