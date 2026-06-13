// resumegpt/frontend/src/components/CareerChat.jsx

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client.js";
import Markdown from "./Markdown.jsx";

export default function CareerChat({ threadId, onThreadCreated, onConversationUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const loadingRef = useRef(false);
  const historyRequestIdRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const loadConversation = useCallback(async (tid) => {
    const requestId = ++historyRequestIdRef.current;
    setLoadingHistory(true);
    setMessages([]);
    try {
      const response = await api.get(`/api/agent/conversations/${tid}`);
      const data = response.messages || response.data?.messages || [];
      if (requestId === historyRequestIdRef.current) {
        setMessages(data);
        // Persist to sessionStorage so refresh doesn't lose the chat
        try {
          sessionStorage.setItem(`career:chat:${tid}`, JSON.stringify(data));
        } catch (_) {}
      }
    } catch (e) {
      console.error("Failed to load conversation", e);
      if (requestId === historyRequestIdRef.current) {
        // Try to restore from sessionStorage on failure
        const cached = sessionStorage.getItem(`career:chat:${tid}`);
        if (cached) {
          try { setMessages(JSON.parse(cached)); } catch (_) { setMessages([]); }
        } else {
          setMessages([]);
        }
      }
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    if (threadId) {
      // Try sessionStorage cache first for instant restore, then revalidate from API
      const cached = sessionStorage.getItem(`career:chat:${threadId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
            setLoadingHistory(false);
          }
        } catch (_) {}
      }
      loadConversation(threadId);
    } else {
      historyRequestIdRef.current += 1;
      setMessages([]);
      setLoadingHistory(false);
    }
  }, [threadId, loadConversation]);

  const inputRef = useRef(input);
  useEffect(() => { inputRef.current = input; }, [input]);

  const handleSend = useCallback(async () => {
    const currentInput = inputRef.current.trim();
    if (!currentInput || loadingRef.current) return;

    const userMessage = { role: "user", content: currentInput };
    // Optimistically show the user's message immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    loadingRef.current = true;
    setLoading(true);

    try {
      const response = await api.post("/api/agent/chat", {
        message: userMessage.content,
        thread_id: threadId,
      });

      const data = response.data || response;
      const isNewThread = !threadId && data.thread_id;

      if (isNewThread) {
        onThreadCreated(data.thread_id);
      }

      // Replace with backend's canonical message list (includes tool calls, etc.)
      // but only if the backend list already has the user message to avoid a flash.
      const backendMessages = data.messages || [];
      const hasUserMsg = backendMessages.some(
        (m) => m.role === "user" && m.content && (typeof m.content === "string" ? m.content : JSON.stringify(m.content)).includes(currentInput.slice(0, 20))
      );
      if (hasUserMsg) {
        setMessages(backendMessages);
        // Persist to sessionStorage
        const tid = data.thread_id || threadId;
        if (tid) {
          try { sessionStorage.setItem(`career:chat:${tid}`, JSON.stringify(backendMessages)); } catch (_) {}
        }
      }
      // If backend doesn't have user msg yet, keep our optimistic update
      // and let loadConversation sync when threadId changes.

      // Only refresh sidebar conversation list for new threads
      if (isNewThread) {
        onConversationUpdate?.();
      }
    } catch (e) {
      console.error("Failed to send chat message", e);
      // Remove the optimistic user message and show error
      setMessages((prev) => [
        ...prev.filter((m) => m !== userMessage),
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
      setInput(userMessage.content);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [threadId, onThreadCreated, onConversationUpdate]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toText = (content) => {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((b) => (typeof b === "string" ? b : b?.text || ""))
        .join("");
    }
    return String(content);
  };

  const visibleMessages = messages.filter((msg) => {
    if (msg.role !== "user" && msg.role !== "assistant") return false;
    if (!msg.content) return false;
    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .map((b) => (typeof b === "string" ? b : b?.text || ""))
            .join("")
        : String(msg.content);
    return text.trim() !== "";
  });
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  const showTypingIndicator = loading && lastVisibleMessage?.role !== "assistant";

  return (
    <div className="career-chat">
      {/* 1. SCROLL AREA - Handles scrollbars only */}
      <div className="chat-scroll-area">
        {/* 2. PADDING AREA - Handles flex layout & breathing room safely */}
        <div className="chat-content-padding">
          
          {loadingHistory ? (
            <div className="chat-skeleton">
              <div className="skeleton-message user">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-bubble"></div>
              </div>
              <div className="skeleton-message assistant">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-bubble">
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line short"></div>
                </div>
              </div>
              <div className="skeleton-message user">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-bubble"></div>
              </div>
              <div className="skeleton-message assistant">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-bubble">
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line short"></div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {visibleMessages.length === 0 && !loading && (
                <div className="chat-welcome">
                  <div className="welcome-icon">🤖</div>
                  <h1>Hi! I'm your Career Assistant</h1>
                  <p>I can help you find jobs on LinkedIn, research companies, and give career advice.</p>
                  <div className="suggestions">
                    <button onClick={() => setInput("Find remote Python developer jobs")}>
                      🔍 Find remote Python jobs
                    </button>
                    <button onClick={() => setInput("Search for entry-level data science positions")}>
                      🎓 Entry-level data science roles
                    </button>
                    <button onClick={() => setInput("Show me jobs at Google")}>
                      🏢 Jobs at Google
                    </button>
                  </div>
                </div>
              )}

              {visibleMessages.map((msg, i) => {
                const text = toText(msg.content);
                const stableKey = `${msg.role}-${i}-${text.slice(0, 40)}`;
                return (
                  <div key={stableKey} className={`message ${msg.role}`}>
                    <div className="message-avatar">
                      {msg.role === "user" ? "👤" : "🤖"}
                    </div>
                    <div className="message-content">
                      <Markdown>{text}</Markdown>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {showTypingIndicator && (
            <div className="message assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          {/* Physical spacer to ensure perfect scroll landing */}
          <div ref={messagesEndRef} style={{ height: 20, flexShrink: 0, width: "100%" }} />
        </div>
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about jobs, companies, career advice..."
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            Send
          </button>
        </div>
      </div>

      <style>{`
        /* ── Root Layout ── */
        .career-chat {
          display: flex !important;
          flex-direction: column !important;
          position: absolute !important;
          inset: 0 !important;
          overflow: hidden !important;
          background: #fffdf8 !important;
        }

        /* ── Outer Scroll Container (Isolates overflow bounds) ── */
        .chat-scroll-area {
          flex: 1 1 0% !important;
          height: 0 !important;           /* Force height resolution to parent bounds */
          min-height: 0 !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          width: 100% !important;
        }

        /* ── Inner Padding/Flex Container (Protects elements from cutoff) ── */
        .chat-content-padding {
          display: flex !important;
          flex-direction: column !important;
          min-height: 100% !important;
          padding: 60px 20px 20px !important;
          box-sizing: border-box !important;
        }

        /* Welcome screen */
        .chat-welcome {
          text-align: center;
          padding: 40px 20px;
          color: #57514a;
          margin: auto 0;
          flex-shrink: 0;
        }
        .welcome-icon { font-size: 48px; margin-bottom: 16px; }
        .chat-welcome h1 { font-size: 24px; margin-bottom: 12px; color: #1c1a17; }
        .chat-welcome p  { font-size: 15px; margin-bottom: 30px; }
        .suggestions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          max-width: 600px;
          margin: 0 auto;
        }
        .suggestions button {
          padding: 10px 16px;
          border: 1px solid #e2dccf;
          border-radius: 20px;
          background: #fff;
          color: #d97706;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .suggestions button:hover { background: #fef3c7; border-color: #d97706; }

        /* ── Skeleton Loading ── */
        .chat-skeleton {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
          flex-shrink: 0;
        }
        .skeleton-message { 
          display: flex; 
          gap: 12px; 
          align-items: flex-start; 
          flex-shrink: 0; 
        }
        .skeleton-message.user   { flex-direction: row-reverse; }
        .skeleton-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%);
          background-size: 200% 100%;
          animation: chatShimmer 1.5s infinite;
          flex-shrink: 0;
        }
        .skeleton-bubble {
          max-width: 70%;
          padding: 14px 18px;
          border-radius: 16px;
          background: linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%);
          background-size: 200% 100%;
          animation: chatShimmer 1.5s infinite;
          min-height: 48px;
        }
        .skeleton-message.user .skeleton-bubble      { border-top-right-radius: 4px; min-width: 120px; }
        .skeleton-message.assistant .skeleton-bubble { border-top-left-radius: 4px; min-width: 200px; }
        .skeleton-bubble .skeleton-line {
          height: 12px; border-radius: 4px;
          background: rgba(0,0,0,0.06); margin-bottom: 8px;
        }
        .skeleton-bubble .skeleton-line:last-child { margin-bottom: 0; }
        .skeleton-bubble .skeleton-line.short { width: 60%; }
        @keyframes chatShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ── Message bubbles ── */
        .message {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
          width: 100%;
          flex-shrink: 0;      
        }
        .message.user { flex-direction: row-reverse; }
        .message-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; flex-shrink: 0; background: #f3f0e9;
        }
        .message.user .message-avatar { background: #d97706; color: white; }
        .message-content {
          max-width: 85%; padding: 14px 18px; border-radius: 16px;
          line-height: 1.6; font-size: 15px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06); word-break: break-word;
        }
        .message.user .message-content {
          background: #d97706; color: white; border-top-right-radius: 4px;
        }
        .message.assistant .message-content {
          background: #fff; color: #1c1a17;
          border: 1px solid #e2dccf; border-top-left-radius: 4px;
        }

        /* Chat-specific markdown overrides */
        .message-content .markdown-body { font-size: 15px; line-height: 1.6; }
        .message-content .markdown-body p:last-child { margin-bottom: 0; }
        .message.user .markdown-body .md-link { color: #fef3c7; }

        /* Typing indicator */
        .typing-indicator { display: flex; gap: 4px; padding: 8px 0; }
        .typing-indicator span {
          width: 8px; height: 8px; background: #d97706; border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }

        /* ── Input bar ── */
        .chat-input-area {
          flex-shrink: 0 !important;
          padding: 16px 20px !important;
          background: #fffdf8 !important;
          border-top: 1px solid #e2dccf !important;
          width: 100% !important;
          z-index: 10;
        }
        .chat-input-wrapper {
          display: flex;
          gap: 12px;
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
          align-items: flex-end;
        }
        .chat-input-area textarea {
          flex: 1;
          padding: 14px 16px;
          border: 1px solid #e2dccf;
          border-radius: 12px;
          background: #fff;
          color: #1c1a17;
          font-size: 15px;
          resize: none;
          outline: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          font-family: inherit;
          line-height: 1.4;
          min-height: 50px;
          max-height: 150px;
        }
        .chat-input-area textarea:focus {
          border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217,119,6,0.1);
        }
        .send-btn {
          height: 50px;
          padding: 0 24px;
          background: #d97706;
          color: white;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .send-btn:hover    { background: #b45309; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}