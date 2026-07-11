// Author-CMS API client — deliberately separate from client.ts. Author auth
// uses its own JWT namespace ("author:<id>") issued only by /api/author/login
// or /api/author/register; a regular user Bearer token is rejected by
// get_current_author on the backend, so this must never reuse authHeaders().
import { BASE } from "./base";
import type { AuthorPost, AuthorProfile } from "./adminTypes";
import { ApiError } from "./errors";

let getAuthorToken: () => string | null = () => null;
let onAuthorUnauthorized: () => void = () => {};

export function configureAuthorAuth(opts: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getAuthorToken = opts.getToken;
  onAuthorUnauthorized = opts.onUnauthorized;
}

function authorHeaders(): Record<string, string> {
  const token = getAuthorToken();
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
    if (res.status === 401 && getAuthorToken()) onAuthorUnauthorized();
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

function get<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: authorHeaders() }).then((r) => handle<T>(r));
}

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authorHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

export interface AuthorAuthResponse {
  access_token: string;
  token_type: string;
  author: AuthorProfile;
}

export const authorApi = {
  login: (email: string, password: string) =>
    send<AuthorAuthResponse>("POST", "/api/author/login", { email, password }),

  register: (body: {
    name: string;
    email: string;
    password: string;
    role?: string;
    bio?: string;
    credentials?: string;
    signup_code?: string;
  }) => send<AuthorAuthResponse>("POST", "/api/author/register", body),

  me: () => get<AuthorProfile>("/api/author/me"),

  updateProfile: (body: Partial<Pick<AuthorProfile, "name" | "role" | "bio" | "credentials" | "avatar_url" | "linkedin_url">>) =>
    send<AuthorProfile>("PUT", "/api/author/me", body),

  changePassword: (current_password: string, new_password: string) =>
    send<{ ok: boolean }>("POST", "/api/author/change-password", {
      current_password,
      new_password,
    }),

  posts: () => get<AuthorPost[]>("/api/author/posts"),

  createPost: (body: { title: string; content: string; excerpt?: string; status?: string }) =>
    send<AuthorPost>("POST", "/api/author/posts", body),

  updatePost: (id: string, body: { title: string; content: string; excerpt?: string; status?: string }) =>
    send<AuthorPost>("PUT", `/api/author/posts/${id}`, body),

  deletePost: (id: string) => send<{ ok: boolean }>("DELETE", `/api/author/posts/${id}`),
};
