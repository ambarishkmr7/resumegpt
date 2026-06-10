import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import AudioInterview from "./AudioInterview.jsx";
import { auth } from "../firebase.js";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

export default function ElitePanel({ content }) {
  const [tab, setTab] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Counseling
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSuggestions, setChatSuggestions] = useState(["What skills should I learn?", "How do I negotiate salary?", "How do I prepare for interviews?"]);

  // Mock Interview
  const [interviewQs, setInterviewQs] = useState(null);
  const [interviewRole, setInterviewRole] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [answers, setAnswers] = useState({});
  const [ratings, setRatings] = useState({});
  const [audioMode, setAudioMode] = useState(false);
  const [audioQCount, setAudioQCount] = useState(10);

  // Job Agent
  const [agentResult, setAgentResult] = useState(null);
  const [agentRole, setAgentRole] = useState("");
  const [agentLoc, setAgentLoc] = useState("");
  const [otpMobile, setOtpMobile] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null); // tracks grecaptcha widget id for reset
  const [applyingAll, setApplyingAll] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState(new Set());

  // Sync phone number from resume content whenever content loads/changes
  useEffect(() => {
    if (!content?.contact?.phone) return;
    const raw = content.contact.phone.trim();
    const digits = raw.replace(/[\s\-\(\)]/g, "");
    const normalised = digits.startsWith("+") ? digits : `+91${digits}`;
    setOtpMobile(normalised);
  }, [content?.contact?.phone]);

  const tools = [
    { id: "counseling", icon: "🤖", label: "Career Counseling" },
    { id: "interview", icon: "🎤", label: "Mock Interview" },
    { id: "agent", icon: "🚀", label: "AI Job Agent" },
  ];

  // Init invisible reCAPTCHA once after mount.
  // #recaptcha-container is always in the DOM (component root, not conditional).
  const initRecaptcha = async () => {
    if (recaptchaRef.current) return; // already alive
    recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        recaptchaRef.current = null;
        recaptchaWidgetIdRef.current = null;
      },
    });
    try {
      recaptchaWidgetIdRef.current = await recaptchaRef.current.render();
    } catch (_) {}
  };

  useEffect(() => {
    initRecaptcha();
    return () => {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_) {}
        recaptchaRef.current = null;
        recaptchaWidgetIdRef.current = null;
      }
    };
  }, []);

  // ---- Career Counseling ----
  const sendChat = async (msg) => {
    const question = msg || chatInput;
    if (!question.trim()) return;
    const newHistory = [...chatHistory, { role: "user", content: question }];
    setChatHistory(newHistory); setChatInput(""); setLoading(true); setError("");
    try {
      const res = await api.careerCounseling(content, question, newHistory);
      setChatHistory([...newHistory, { role: "assistant", content: res.response }]);
      setChatSuggestions(res.suggestions || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ---- Mock Interview ----
  const startInterview = async (mode) => {
    setLoading(true); setError(""); setAnswers({}); setRatings({});
    try {
      const count = mode === "audio" ? audioQCount : 55;
      const qs = await api.mockInterview(content, interviewRole || null, "medium", count);
      setInterviewQs(qs);
      if (mode === "audio") setAudioMode(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const submitAnswer = async (q) => {
    const answer = answers[q.id];
    if (!answer?.trim()) return;
    setLoading(true);
    try {
      const result = await api.rateAnswer(content, q.question, answer, interviewQs?.role);
      setRatings((prev) => ({ ...prev, [q.id]: result }));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const filteredQs = interviewQs?.questions?.filter(q =>
    filterCat === "all" || q.type === filterCat || q.category === filterCat
  ) || [];

  const answeredCount = Object.keys(ratings).length;
  const avgScore = answeredCount > 0 ? Math.round(Object.values(ratings).reduce((s, r) => s + (r.score || 0), 0) / answeredCount) : 0;

  // ---- Job Agent ----
  const runAgent = async () => {
    setLoading(true); setError(""); setOtpVerified(false); setOtpSent(false);
    setOtpError(""); setOtpCode(""); setAppliedJobs(new Set());
    confirmationRef.current = null;
    // Reset widget token (don't destroy — keep verifier alive for next OTP send)
    if (recaptchaWidgetIdRef.current != null) {
      try { window.grecaptcha?.reset(recaptchaWidgetIdRef.current); } catch (_) {}
    }
    try { setAgentResult(await api.jobAgent(content, agentRole || null, agentLoc || null)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const sendOtp = async () => {
    setOtpError(""); setError("");
    const digits = otpMobile.replace(/[\s\-\(\)]/g, "");
    const phone = digits.startsWith("+") ? digits : `+91${digits}`;
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      setOtpError("Enter a valid mobile number (e.g. +91 98765 43210)"); return;
    }
    setOtpLoading(true);
    try {
      // If verifier exists but token may be stale, reset the grecaptcha widget
      if (recaptchaRef.current && recaptchaWidgetIdRef.current != null) {
        try { window.grecaptcha?.reset(recaptchaWidgetIdRef.current); } catch (_) {}
      }
      // Re-init verifier if it was cleared (e.g. after runAgent or expired)
      if (!recaptchaRef.current) {
        await initRecaptcha();
      }
      const result = await signInWithPhoneNumber(auth, phone, recaptchaRef.current);
      confirmationRef.current = result;
      setOtpSent(true);
    } catch (e) {
      const code = e.code || "";
      if (code === "auth/invalid-phone-number") setOtpError("Invalid number. Use +CountryCode format e.g. +919876543210.");
      else if (code === "auth/too-many-requests") setOtpError("Too many attempts. Wait a few minutes and try again.");
      else if (code === "auth/quota-exceeded") setOtpError("SMS quota exceeded for today. Try again tomorrow.");
      else if (code === "auth/operation-not-allowed") setOtpError("Phone auth not enabled — Firebase Console → Authentication → Sign-in method → Phone → Enable.");
      else if (code === "auth/captcha-check-failed") setOtpError("reCAPTCHA check failed. Please refresh and try again.");
      else setOtpError(e.message || "Failed to send OTP. Please try again.");
      // Full teardown so next attempt starts completely fresh
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_) {}
        recaptchaRef.current = null;
        recaptchaWidgetIdRef.current = null;
      }
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    setOtpError("");
    if (!otpCode || otpCode.trim().length !== 6) { setOtpError("Enter the 6-digit OTP."); return; }
    if (!confirmationRef.current) { setOtpError("Session expired. Request a new OTP."); return; }
    setOtpLoading(true);
    try {
      await confirmationRef.current.confirm(otpCode.trim());
      setOtpVerified(true);
    } catch (e) {
      const code = e.code || "";
      if (code === "auth/invalid-verification-code") setOtpError("Incorrect OTP. Try again.");
      else if (code === "auth/code-expired") { setOtpError("OTP expired. Request a new one."); setOtpSent(false); confirmationRef.current = null; }
      else setOtpError(e.message || "Verification failed.");
    } finally { setOtpLoading(false); }
  };

  const resendOtp = () => { setOtpSent(false); setOtpCode(""); setOtpError(""); confirmationRef.current = null; };

  const applyAll = async () => {
    setApplyingAll(true);
    for (let i = 0; i < (agentResult?.job_listings?.length || 0); i++) {
      await new Promise(r => setTimeout(r, 800));
      setAppliedJobs(prev => new Set([...prev, i]));
    }
    setApplyingAll(false);
  };

  return (
    <div className="panel elite-panel">
      {/* Always in DOM — Firebase RecaptchaVerifier anchors to this div on mount */}
      <div id="recaptcha-container" style={{ position: "absolute", visibility: "hidden" }} />
      <h3>✨ Elite AI Tools</h3>
      <div className="ai-tools-grid">
        {tools.map(t => (
          <button key={t.id} className={`ai-tool-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => { setTab(t.id); setAudioMode(false); }} disabled={loading && tab !== t.id}>
            <span className="ai-tool-icon">{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {/* ======== CAREER COUNSELING ======== */}
      {tab === "counseling" && (
        <div className="chat-panel">
          <div className="chat-messages">
            {chatHistory.length === 0 && <div className="chat-welcome"><p>👋 Hi! I'm your AI career counselor. Ask me anything — salary, interviews, skills, career transitions, and more.</p></div>}
            {chatHistory.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}><div className="chat-bubble">{m.content}</div></div>
            ))}
            {loading && <div className="chat-msg assistant"><div className="chat-bubble">Thinking…</div></div>}
          </div>
          {chatSuggestions.length > 0 && (
            <div className="chat-suggestions">
              {chatSuggestions.map((s, i) => <button key={i} className="chat-suggestion" onClick={() => sendChat(s)}>{s}</button>)}
            </div>
          )}
          <div className="chat-input-row">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type your career question…"
              onKeyDown={e => e.key === "Enter" && sendChat()} />
            <button className="btn btn-primary btn-sm" onClick={() => sendChat()} disabled={loading || !chatInput.trim()}>Send</button>
          </div>
        </div>
      )}

      {/* ======== MOCK INTERVIEW ======== */}
      {tab === "interview" && (
        <div className="interview-panel">

          {/* Audio Interview — full takeover */}
          {audioMode && interviewQs ? (
            <AudioInterview
              content={content}
              questions={interviewQs.questions}
              role={interviewQs.role}
              onExit={() => { setAudioMode(false); setInterviewQs(null); }}
            />
          ) : !interviewQs ? (
            /* Start screen */
            <div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
                55 scenario-based questions across behavioral, technical, situational, and role-specific categories.
              </p>
              <div className="field"><label>Target Role</label>
                <input value={interviewRole} onChange={e => setInterviewRole(e.target.value)}
                  placeholder={content?.contact?.title || "e.g. Senior Software Engineer"} />
              </div>

              <div className="interview-mode-cards">
                {/* Text Mode */}
                <div className="mode-card">
                  <div className="mode-icon">⌨️</div>
                  <h4>Text Interview</h4>
                  <p>55 questions. Type your answers. Get instant AI scoring.</p>
                  <button className="btn btn-primary" onClick={() => startInterview("text")} disabled={loading} style={{ width: "100%" }}>
                    {loading ? "Loading…" : "Start Text Interview"}
                  </button>
                </div>

                {/* Audio Mode */}
                <div className="mode-card audio">
                  <div className="mode-icon">🎙️</div>
                  <h4>AI Audio Interview</h4>
                  <p>AI speaks questions aloud. You answer by voice. Real interview experience.</p>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11 }}>Number of questions</label>
                    <select value={audioQCount} onChange={e => setAudioQCount(Number(e.target.value))}>
                      <option value={5}>5 (Quick practice)</option>
                      <option value={10}>10 (Standard)</option>
                      <option value={20}>20 (Thorough)</option>
                      <option value={30}>30 (Deep practice)</option>
                      <option value={55}>55 (Full interview)</option>
                    </select>
                  </div>
                  <button className="btn btn-primary" onClick={() => startInterview("audio")} disabled={loading}
                    style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}>
                    {loading ? "Loading…" : "🎙️ Start AI Audio Interview"}
                  </button>
                  <p style={{ fontSize: 10, color: "#888", marginTop: 4, textAlign: "center" }}>Requires Chrome · Microphone access</p>
                </div>
              </div>
            </div>
          ) : (
            /* Text interview mode */
            <div>
              <div className="interview-header">
                <h4>{interviewQs.role} — {interviewQs.total_questions} Questions</h4>
                <button className="btn btn-ghost btn-sm" onClick={() => { setInterviewQs(null); setAnswers({}); setRatings({}); }}>New Interview</button>
              </div>

              {answeredCount > 0 && (
                <div className="interview-report">
                  <div className="ir-score">{avgScore}/100</div>
                  <div className="ir-meta">{answeredCount} answered · {filteredQs.length - answeredCount} remaining</div>
                </div>
              )}

              <div className="cat-filter">
                <button className={`cat-btn ${filterCat === "all" ? "active" : ""}`} onClick={() => setFilterCat("all")}>All ({interviewQs.questions?.length})</button>
                {interviewQs.types?.map(t => {
                  const count = interviewQs.questions?.filter(q => q.type === t).length;
                  return <button key={t} className={`cat-btn ${filterCat === t ? "active" : ""}`} onClick={() => setFilterCat(t)}>{t} ({count})</button>;
                })}
              </div>

              {filteredQs.map(q => (
                <div key={q.id} className="interview-q">
                  <div className="q-header">
                    <span className={`q-type ${q.type}`}>{q.category || q.type}</span>
                    <span className="q-num">Q{q.id}</span>
                  </div>
                  <p className="q-text">{q.question}</p>
                  {q.tips && <p className="q-tips">💡 {q.tips}</p>}
                  <textarea rows={3} value={answers[q.id] || ""} placeholder="Type your answer…"
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} />
                  <button className="btn btn-ghost btn-sm" onClick={() => submitAnswer(q)} disabled={loading || !answers[q.id]?.trim()}>
                    {loading ? "Rating…" : "📊 Rate My Answer"}
                  </button>
                  {ratings[q.id] && (
                    <div className="rating-card">
                      <div className="rating-score">
                        <span className={`score-badge ${ratings[q.id].score >= 80 ? "good" : ratings[q.id].score >= 60 ? "ok" : "weak"}`}>{ratings[q.id].score}/100</span>
                        <span className="rating-label">{ratings[q.id].rating}</span>
                      </div>
                      {ratings[q.id].strengths?.length > 0 && <div><strong>Strengths:</strong><ul>{ratings[q.id].strengths.map((s, i) => <li key={i} className="ai-good">{s}</li>)}</ul></div>}
                      {ratings[q.id].gaps?.length > 0 && <div><strong>Gaps:</strong><ul>{ratings[q.id].gaps.map((g, i) => <li key={i} className="ai-warn">{g}</li>)}</ul></div>}
                      {ratings[q.id].suggested_answer && <div className="suggested-answer"><strong>Suggested Answer:</strong><p>{ratings[q.id].suggested_answer}</p></div>}
                      {ratings[q.id].references?.length > 0 && <div className="references"><strong>References:</strong><ul>{ratings[q.id].references.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======== AI JOB AGENT ======== */}
      {tab === "agent" && (
        <div className="agent-panel">
          {!agentResult ? (
            <div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
                AI finds matching jobs, prepares cover letters, and helps you apply to all with one click.
              </p>
              <div className="field"><label>Target Role</label>
                <input value={agentRole} onChange={e => setAgentRole(e.target.value)} placeholder={content?.contact?.title || "e.g. Senior Software Engineer"} />
              </div>
              <div className="field"><label>Location</label>
                <input value={agentLoc} onChange={e => setAgentLoc(e.target.value)} placeholder={content?.contact?.location || "e.g. Bangalore"} />
              </div>
              <button className="btn btn-primary" onClick={runAgent} disabled={loading} style={{ width: "100%" }}>
                {loading ? "Searching…" : "🚀 Launch AI Job Agent"}
              </button>
            </div>
          ) : (
            <div>
              <div className="interview-header">
                <h4>Jobs for {agentResult.target_role}</h4>
                <button className="btn btn-ghost btn-sm" onClick={() => setAgentResult(null)}>New Search</button>
              </div>

              <div className="agent-section">
                <h4>🔍 Search on Platforms</h4>
                <div className="agent-links">
                  {agentResult.job_sources?.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">{s.icon} {s.platform}</a>
                  ))}
                </div>
              </div>

              <div className="agent-section">
                <h4>📋 Target Companies ({agentResult.job_listings?.length})</h4>
                {!otpVerified ? (
                  <div className="otp-section">
                    <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>🔐 Verify mobile before applying.</p>
                    {!otpSent ? (
                      <div>
                        <div className="otp-row">
                          <input value={otpMobile} onChange={e => setOtpMobile(e.target.value)} placeholder="+91 98765 43210" style={{ flex: 1 }} disabled={otpLoading} />
                          <button className="btn btn-primary btn-sm" onClick={sendOtp} disabled={otpLoading || !otpMobile.trim()}>
                            {otpLoading ? "Sending…" : "Send OTP"}
                          </button>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>OTP sent via SMS · Powered by Firebase</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 13, marginBottom: 8 }}>📱 OTP sent to <strong>{otpMobile}</strong></p>
                        <div className="otp-row">
                          <input value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="Enter 6-digit OTP" maxLength={6} inputMode="numeric" style={{ flex: 1, letterSpacing: "0.2em", fontWeight: 700 }} disabled={otpLoading} />
                          <button className="btn btn-primary btn-sm" onClick={verifyOtp} disabled={otpLoading || otpCode.length !== 6}>
                            {otpLoading ? "Verifying…" : "Verify"}
                          </button>
                        </div>
                        <button className="link-btn" onClick={resendOtp} style={{ fontSize: 12, marginTop: 6 }} disabled={otpLoading}>↩ Resend OTP</button>
                      </div>
                    )}
                    {otpError && <div className="error" style={{ marginTop: 8, fontSize: 13 }}>{otpError}</div>}
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    <div className="otp-verified">✅ Mobile verified: {otpMobile}</div>
                    <button className="btn btn-primary" onClick={applyAll} disabled={applyingAll}
                      style={{ width: "100%", marginTop: 8, background: "linear-gradient(135deg, #d97706, #b45309)" }}>
                      {applyingAll ? `Applying... (${appliedJobs.size}/${agentResult.job_listings?.length})` : `🚀 Apply All (${agentResult.job_listings?.length} jobs)`}
                    </button>
                  </div>
                )}

                {agentResult.job_listings?.map((job, i) => (
                  <div key={i} className={`job-card ${appliedJobs.has(i) ? "applied" : ""}`}>
                    <div className="job-card-head">
                      <div><strong>{job.company}</strong><span className="job-role">{job.role}</span></div>
                      <span className="gd-badge">⭐ {job.glassdoor_rating}</span>
                    </div>
                    <p className="job-match">{job.match_reason}</p>
                    <div className="job-location">📍 {job.location}</div>
                    <div className="company-links" style={{ marginTop: 6 }}>
                      <a href={job.apply_urls?.linkedin} target="_blank" rel="noopener noreferrer" className="job-link linkedin">LinkedIn →</a>
                      <a href={job.apply_urls?.naukri} target="_blank" rel="noopener noreferrer" className="job-link naukri">Naukri →</a>
                      <a href={job.apply_urls?.indeed} target="_blank" rel="noopener noreferrer" className="job-link indeed">Indeed →</a>
                    </div>
                    {appliedJobs.has(i) && <div className="job-applied-badge">✅ Application sent</div>}
                  </div>
                ))}
              </div>

              <div className="agent-section">
                <h4>📝 Cover Letter</h4>
                <div className="ai-writeup" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{agentResult.cover_letter}</div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(agentResult.cover_letter)}>Copy</button>
              </div>

              <div className="agent-section">
                <h4>💬 Recruiter Q&A</h4>
                {agentResult.recruiter_qa?.map((qa, i) => (
                  <div key={i} className="qa-card"><div className="qa-q">Q: {qa.question}</div><div className="qa-a">A: {qa.answer}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
