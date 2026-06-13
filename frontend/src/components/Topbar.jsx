import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
];

export default function Topbar() {
  const { user, logout, profilePhoto } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isActive = (to) => {
    if (to === "/") return location.pathname === "/";
    return location.pathname.startsWith(to);
  };

  // Close dropdown on outside click
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

  const initials = user
    ? (user.full_name || user.email || "?").charAt(0).toUpperCase()
    : "?";

  return (
    <nav className="topbar">
      <Link to="/" className="topbar-brand">
        <img src="/logo.png" alt="ResumeGPT" className="topbar-logo" />
        <span>ResumeGPT</span>
      </Link>

      {user && (
        <div className="topbar-nav">
          {user.is_admin ? (
            <Link
              to="/admin"
              className={`topbar-nav-link ${isActive("/admin") ? "active" : ""}`}
            >
              🛡️ Admin Panel
            </Link>
          ) : (
            NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`topbar-nav-link ${isActive(item.to) ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))
          )}
        </div>
      )}

      <div className="spacer" />

      {user && (
        <div className="topbar-profile" ref={dropdownRef}>
          <button
            className="topbar-profile-trigger"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            type="button"
          >
            {profilePhoto ? (
              <img src={profilePhoto} alt="Profile" className="topbar-avatar" />
            ) : (
              <div className="topbar-avatar topbar-avatar-initials">{initials}</div>
            )}
            <span className="topbar-username">{user.full_name || user.email}</span>
            <span className="topbar-caret">▾</span>
          </button>

          {dropdownOpen && (
            <div className="topbar-dropdown">
              {user.is_admin ? (
                <>
                  <button className="topbar-dropdown-item" onClick={() => { setDropdownOpen(false); navigate("/admin"); }} type="button">
                    🛡️ Admin Panel
                  </button>
                  <div className="topbar-dropdown-sep" />
                  <button className="topbar-dropdown-item topbar-dropdown-logout" onClick={handleLogout} type="button">
                    🚪 Logout
                  </button>
                </>
              ) : (
                <>
                  <button className="topbar-dropdown-item" onClick={handleEditProfile} type="button">
                    ✏️ Edit Profile
                  </button>
                  <div className="topbar-dropdown-sep" />
                  <button className="topbar-dropdown-item topbar-dropdown-logout" onClick={handleLogout} type="button">
                    🚪 Logout
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
