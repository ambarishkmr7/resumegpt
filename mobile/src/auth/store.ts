import { create } from "zustand";
import { api, configureAuth } from "../api/client";
import type { AuthResponse, User } from "../api/types";
import {
  loadCachedUser,
  loadToken,
  saveCachedUser,
  saveToken,
} from "./tokenStorage";

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean; // true once SecureStore has been read at startup
  sessionExpired: boolean;
  hydrate: () => Promise<void>;
  setSession: (auth: AuthResponse) => Promise<void>;
  clearSession: (opts?: { expired?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, getState) => ({
  token: null,
  user: null,
  hydrated: false,
  sessionExpired: false,

  hydrate: async () => {
    const [token, user] = await Promise.all([loadToken(), loadCachedUser()]);
    set({ token, user, hydrated: true });
    // Background re-verify like the web AuthContext: cached user renders
    // instantly, /me confirms the token is still good.
    if (token) {
      try {
        const fresh = await api.me();
        set({ user: fresh });
        void saveCachedUser(fresh);
      } catch {
        /* handled by the global 401 hook if the token is dead */
      }
    }
  },

  setSession: async (auth) => {
    set({ token: auth.access_token, user: auth.user, sessionExpired: false });
    await Promise.all([
      saveToken(auth.access_token),
      saveCachedUser(auth.user),
    ]);
  },

  clearSession: async (opts) => {
    set({ token: null, user: null, sessionExpired: !!opts?.expired });
    await Promise.all([saveToken(null), saveCachedUser(null)]);
  },

  refreshUser: async () => {
    if (!getState().token) return;
    const fresh = await api.me();
    set({ user: fresh });
    void saveCachedUser(fresh);
  },
}));

// Give the API client access to the token and a 401 handler without an
// import cycle. A dead token (no refresh flow exists) drops straight to login.
configureAuth({
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => {
    void useAuth.getState().clearSession({ expired: true });
  },
});

export function isGuest(user: User | null): boolean {
  if (!user) return false;
  if (user.is_guest) return true;
  return (user.email || "").endsWith("@guest.resumesgpt.in");
}
