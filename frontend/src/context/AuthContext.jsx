import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, BASE } from "../api/client";

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
        const msg = err?.message || "";
        const statusMatch = msg.match(/\((\d{3})\)/);
        const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : null;
        if (status === 401 || status === 403) {
          // Only clear if the token hasn't been replaced by a concurrent login
          if (localStorage.getItem("token") === token) {
            localStorage.removeItem("token");
            setUser(null);
          }
        }
        setLoading(false);
      });
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
    try { await api.logout(); } catch (_) {}
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
