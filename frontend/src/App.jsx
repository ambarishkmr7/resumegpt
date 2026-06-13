import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Editor from "./pages/Editor.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import CmsPage from "./pages/CmsPage.jsx";
import BlogPage from "./pages/BlogPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import CareerPage from "./pages/CareerPage.jsx";
import { SkeletonStyles } from "./components/Skeleton.jsx";

function AuthSkeleton() {
  return (
    <div className="center-screen" style={{ flexDirection: "column", gap: 20 }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: "linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%)",
        backgroundSize: "200% 100%", animation: "sk-shimmer 1.5s infinite",
      }} />
      <div style={{
        width: 200, height: 18, borderRadius: 6,
        background: "linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%)",
        backgroundSize: "200% 100%", animation: "sk-shimmer 1.5s infinite",
      }} />
      <style>{`
        @keyframes sk-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  // Admins always land on /admin, not the user dashboard
  if (user.is_admin) return <Navigate to="/admin" replace />;
  return children;
}

function AdminProtected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/page/:slug" element={<CmsPage />} />
      <Route path="/page/blog" element={<BlogPage />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/editor/:id" element={<Protected><Editor /></Protected>} />
      <Route path="/admin" element={<AdminProtected><AdminPage /></AdminProtected>} />
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/career" element={<Protected><CareerPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
