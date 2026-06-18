import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Topbar() {
  const { user, logout, profilePhoto } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  const handleEditProfile = () => {
    setDropdownOpen(false);
    navigate("/profile");
  };

  const isGuest = user?.email?.endsWith("@guest.resumesgpt.in");
  const initials = user
    ? (user.full_name || user.email || "?").charAt(0).toUpperCase()
    : "?";
  const [imgError, setImgError] = useState(false);

  // Reset imgError when profilePhoto changes (e.g. after re-upload)
  useEffect(() => { setImgError(false); }, [profilePhoto]);

  const showPhoto = profilePhoto && !imgError;

  return (
    <nav className="topbar">
      <Link to="/" className="topbar-brand">
        <img src="/logo.png" alt="resumesGPT" className="topbar-logo" />
        <span>resumesGPT</span>
      </Link>

      <div className="spacer" />

      {!user && (
        <Link
          to="/login"
          className="btn btn-primary btn-sm"
          style={{ minHeight: "unset", minWidth: "unset", textDecoration: "none" }}
        >
          Login
        </Link>
      )}

      {isGuest && (
        <Link
          to="/register"
          className="btn btn-primary btn-sm"
          style={{ minHeight: "unset", minWidth: "unset", textDecoration: "none", marginRight: 8 }}
        >
          💾 Save your work — Sign up free
        </Link>
      )}

      {user && !isGuest && (
        <Link
          to="/jobs"
          className="btn btn-ghost btn-sm"
          style={{ minHeight: "unset", minWidth: "unset", textDecoration: "none", marginRight: 8 }}
        >
          💼 Find Jobs
        </Link>
      )}

      {user && !isGuest && (
        <div className="topbar-profile" ref={dropdownRef}>
          <button
            className="topbar-profile-trigger"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            type="button"
          >
            {showPhoto ? (
              <div className="topbar-avatar">
                <img src={profilePhoto} alt="Profile" onError={() => setImgError(true)} />
              </div>
            ) : (
              <div className="topbar-avatar topbar-avatar-initials">{initials}</div>
            )}
            <span className="topbar-username">{user.full_name || user.email}</span>
          </button>

          {dropdownOpen && (
            <div className="topbar-dropdown">
              <button className="topbar-dropdown-item" onClick={handleEditProfile} type="button">
                ✏️ Edit Profile
              </button>
              <div className="topbar-dropdown-sep" />
              <button className="topbar-dropdown-item topbar-dropdown-logout" onClick={handleLogout} type="button">
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
