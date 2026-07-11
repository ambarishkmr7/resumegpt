import { create } from "zustand";
import type { AuthorProfile } from "../api/adminTypes";
import { authorApi, configureAuthorAuth, type AuthorAuthResponse } from "../api/authorClient";
import {
  loadAuthorToken,
  loadCachedAuthor,
  saveAuthorToken,
  saveCachedAuthor,
} from "./authorTokenStorage";

interface AuthorAuthState {
  token: string | null;
  author: AuthorProfile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (auth: AuthorAuthResponse) => Promise<void>;
  clearSession: () => Promise<void>;
  refreshAuthor: () => Promise<void>;
}

export const useAuthorAuth = create<AuthorAuthState>((set, getState) => ({
  token: null,
  author: null,
  hydrated: false,

  hydrate: async () => {
    const [token, author] = await Promise.all([loadAuthorToken(), loadCachedAuthor()]);
    set({ token, author, hydrated: true });
    if (token) {
      try {
        const fresh = await authorApi.me();
        set({ author: fresh });
        void saveCachedAuthor(fresh);
      } catch {
        /* handled by the 401 hook if the token is dead */
      }
    }
  },

  setSession: async (auth) => {
    set({ token: auth.access_token, author: auth.author });
    await Promise.all([saveAuthorToken(auth.access_token), saveCachedAuthor(auth.author)]);
  },

  clearSession: async () => {
    set({ token: null, author: null });
    await Promise.all([saveAuthorToken(null), saveCachedAuthor(null)]);
  },

  refreshAuthor: async () => {
    if (!getState().token) return;
    const fresh = await authorApi.me();
    set({ author: fresh });
    void saveCachedAuthor(fresh);
  },
}));

configureAuthorAuth({
  getToken: () => useAuthorAuth.getState().token,
  onUnauthorized: () => {
    void useAuthorAuth.getState().clearSession();
  },
});
