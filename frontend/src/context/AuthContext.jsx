import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, BASE } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const photoFetched = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch((err) => {
        const msg = err?.message || "";
        const statusMatch = msg.match(/\((\d{3})\)/);
        const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : null;
        if (status === 401 || status === 403) {
          localStorage.removeItem("token");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch profile photo once per session (not on every mount)
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

  const logout = useCallback(async () => {
    try { await api.logout(); } catch (_) {}
    localStorage.removeItem("token");
    setUser(null);
    setProfilePhoto(null);
    photoFetched.current = false;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, googleLogin, facebookLogin, logout,
      profilePhoto, refreshProfilePhoto,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
