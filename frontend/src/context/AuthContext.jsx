import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, BASE, invalidateCache } from "../api/client";
import { clearUserScopedStorage } from "../utils/session";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => readStoredUser());
  // Skip loading skeleton when we already have a cached user; background-verify the token
  const [loading, setLoading] = useState(() => !readStoredUser());
  const [profilePhoto, setProfilePhoto] = useState(null);
  const photoFetched = useRef(false);

  const setUser = useCallback((u) => {
    setUserState(u);
    if (u) {
      localStorage.setItem("user", JSON.stringify(u));
    } else {
      localStorage.removeItem("user");
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Verify token in background — don't block UI when user is already cached
    api
      .me()
      .then((freshUser) => { setUser(freshUser); setLoading(false); })
      .catch((err) => {
        // 401 => expired/invalid token. The API client has already dropped it
        // from storage; mirror that in React state so guards send us to /login.
        // (A network error leaves the cached user alone so offline reloads
        // don't look like a logout.)
        if (err?.status === 401) setUser(null);
        setLoading(false);
      });
  }, []);

  // Any authenticated request that comes back 401 kills the session, not just
  // the /me check above — otherwise a page that only calls, say, /api/resumes
  // would keep rendering as "logged in" with every request failing.
  useEffect(() => {
    const onUnauthorized = (e) => {
      if (e.detail?.scope === "author") return; // author area manages its own token
      setUserState(null);
      setProfilePhoto(null);
      photoFetched.current = false;
      setLoading(false);
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  // Fetch profile photo once per session
  useEffect(() => {
    if (!user || photoFetched.current) return;
    photoFetched.current = true;
    api.getProfile()
      .then((p) => {
        if (p.profile_photo_key) {
          setProfilePhoto(`${BASE}/api/profile/photo?key=${p.profile_photo_key}`);
        }
      })
      .catch(() => {});
  }, [user]);

  const refreshProfilePhoto = useCallback(() => {
    api.getProfile()
      .then((p) => {
        setProfilePhoto(p.profile_photo_key
          ? `/api/profile/photo?key=${p.profile_photo_key}`
          : null);
      })
      .catch(() => {});
  }, []);

  const persist = (data) => {
    localStorage.setItem("token", data.access_token);
    setUser(data.user);
  };

  const login = async (email, password) => persist(await api.login(email, password));
  const register = async (body) => persist(await api.register(body));
  const googleLogin = async (credential) => persist(await api.googleLogin(credential));
  const facebookLogin = async (accessToken) => persist(await api.facebookLogin(accessToken));
  const loginWithToken = (data) => persist(data);

  const logout = useCallback(async () => {
    // An already-expired token makes this 401, which flags "session expired" —
    // wrong wording for a deliberate sign-out, so clear the flag afterwards.
    try { await api.logout(); } catch (_) {}
    invalidateCache();  // never serve the next user this one's data
    clearUserScopedStorage();
    localStorage.removeItem("token");
    setUser(null);
    setProfilePhoto(null);
    photoFetched.current = false;
  }, [setUser]);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, googleLogin, facebookLogin, logout,
      loginWithToken, profilePhoto, refreshProfilePhoto,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
