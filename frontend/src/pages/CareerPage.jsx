import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import CareerChat from "../components/CareerChat.jsx";
import Topbar from "../components/Topbar.jsx";
import { api } from "../api/client.js";
import Markdown from "../components/Markdown.jsx";

function timeAgo(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} yr${years > 1 ? "s" : ""} ago`;
}

function ConversationSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="conversation-item skeleton-item">
          <div className="skeleton-line skeleton-title"></div>
          <div className="skeleton-line skeleton-preview"></div>
        </div>
      ))}
    </>
  );
}

export default function CareerPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const response = await api.get("/api/agent/conversations");
      const convos = response.conversations || response.data?.conversations || [];
      setConversations(convos);

      // Restore previously active thread from sessionStorage if it still exists
      const savedThreadId = sessionStorage.getItem("career:activeThreadId");
      if (savedThreadId && convos.some((c) => c.thread_id === savedThreadId)) {
        setActiveThreadId(savedThreadId);
      }
    } catch (e) {
      console.error("Failed to fetch conversations", e);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleNewChat = () => {
    setActiveThreadId(null);
    sessionStorage.removeItem("career:activeThreadId");
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  const handleSelectThread = (threadId) => {
    setActiveThreadId(threadId);
    sessionStorage.setItem("career:activeThreadId", threadId);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  const handleDeleteThread = async (threadId) => {
    try {
      await api.delete(`/api/agent/conversations/${threadId}`);
      setConversations((prev) => prev.filter((c) => c.thread_id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        sessionStorage.removeItem("career:activeThreadId");
      }
      // Clean up cached chat messages for deleted thread
      sessionStorage.removeItem(`career:chat:${threadId}`);
    } catch (e) {
      console.error("Failed to delete conversation", e);
    }
  };

  return (
    <div className="career-fullscreen">
      <Topbar />
      <div className="career-layout">
        <aside className={`career-sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="sidebar-header">
            <h2>Chat History</h2>
            <button className="new-chat-btn" onClick={handleNewChat}>
              + New Chat
            </button>
          </div>
          <div className="conversation-list">
            {conversationsLoading && <ConversationSkeleton />}
            {!conversationsLoading && conversations.length === 0 && (
              <p className="empty-state">No conversations yet. Start a new chat to save history!</p>
            )}
            {!conversationsLoading && conversations.map((conv) => (
              <div
                key={conv.thread_id}
                className={`conversation-item ${activeThreadId === conv.thread_id ? "active" : ""}`}
                onClick={() => handleSelectThread(conv.thread_id)}
              >
                <div className="conv-title">{conv.title || "New Chat"}</div>
                <div className="conv-meta">
                  <span className="conv-time">{timeAgo(conv.updated_at)}</span>
                </div>
                <button
                  className="delete-conv-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteThread(conv.thread_id);
                  }}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="career-main">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <CareerChat
            threadId={activeThreadId}
            onThreadCreated={setActiveThreadId}
            onConversationUpdate={fetchConversations}
          />
        </main>
      </div>

      <style>{`
        /* ── Fullscreen shell ── */
        .career-fullscreen {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: #fffdf8;
          overflow: hidden;
        }

        /* Override the global topbar sticky so it behaves as a normal flex child */
        .career-fullscreen .topbar {
          position: relative !important;
          flex-shrink: 0;
          z-index: 20;
        }

        /* ── Content area below topbar ── */
        .career-layout {
          display: flex;
          flex: 1;
          min-height: 0;   /* critical: lets children shrink below content size */
          width: 100%;
          overflow: hidden;
        }

        /* ── Sidebar ── */
        .career-sidebar {
          width: 280px;
          background: #fff;
          color: #1c1a17;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #e2dccf;
          transition: transform 0.2s ease-in-out;
          flex-shrink: 0;
          overflow-y: auto;
        }
        .career-sidebar.closed {
          transform: translateX(-100%);
          position: absolute;
          height: 100%;
          z-index: 10;
        }
        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #e2dccf;
          background: #fdfaf4;
          flex-shrink: 0;
        }
        .sidebar-header h2 {
          margin: 0 0 12px 0;
          font-size: 16px;
          color: #1c1a17;
        }
        .new-chat-btn {
          width: 100%;
          padding: 10px;
          background: #d97706;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: background 0.2s;
        }
        .new-chat-btn:hover { background: #b45309; }

        .conversation-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 8px;
        }
        .conversation-item {
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          margin-bottom: 6px;
          position: relative;
          color: #57514a;
          border: 1px solid transparent;
          transition: all 0.2s;
        }
        .conversation-item:hover { background: #f3f0e9; border-color: #e2dccf; }
        .conversation-item.active { background: #fef3c7; color: #b45309; border-color: #fde68a; }
        .conv-title {
          font-weight: 600;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 20px;
        }
        .conv-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
        }
        .conv-time {
          font-size: 11px;
          color: #999;
          white-space: nowrap;
        }
        .conversation-item.active .conv-time {
          color: #b45309;
          opacity: 0.7;
        }
        .conv-preview .markdown-body pre,
        .conv-preview .markdown-body blockquote,
        .conv-preview .markdown-body table {
          display: none;
        }
        .delete-conv-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: #aaa;
          font-size: 18px;
          cursor: pointer;
          display: none;
          line-height: 1;
        }
        .conversation-item:hover .delete-conv-btn { display: block; color: #ef4444; }
        .delete-conv-btn:hover { color: #b91c1c; }
        .empty-state { padding: 20px; text-align: center; color: #888; font-size: 13px; }

        /* ── Main chat area ── */
        .career-main {
          flex: 1;
          min-height: 0;      /* critical */
          min-width: 0;       /* critical: prevents overflow in flex row */
          display: flex;
          flex-direction: column;
          position: relative;
          background: #fffdf8;
          overflow: hidden;
        }

        /* ── Sidebar toggle button ── */
        .sidebar-toggle {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 5;
          background: #fff;
          color: #1c1a17;
          border: 1px solid #e2dccf;
          border-radius: 6px;
          padding: 6px 10px;
          cursor: pointer;
          font-size: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          transition: all 0.2s;
        }
        .sidebar-toggle:hover { background: #f3f0e9; }

        /* ── Skeleton loading for conversation list ── */
        .skeleton-item {
          pointer-events: none;
          border: none !important;
          background: transparent !important;
        }
        .skeleton-line {
          background: linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
        .skeleton-title {
          height: 14px;
          width: 70%;
          margin-bottom: 8px;
        }
        .skeleton-preview {
          height: 10px;
          width: 90%;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 768px) {
          .career-sidebar {
            position: absolute;
            z-index: 20;
            height: 100%;
            box-shadow: 2px 0 10px rgba(0,0,0,0.1);
          }
        }
      `}</style>
    </div>
  );
}
