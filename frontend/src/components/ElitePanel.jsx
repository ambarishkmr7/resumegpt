import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import AudioInterview from "./AudioInterview.jsx";
// import { auth } from "../firebase.js";                                    // Phone OTP — commented out
// import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth"; // Phone OTP — commented out
import { SkeletonLine, SkeletonBlock } from "./Skeleton.jsx";

export default function ElitePanel({ content }) {
  const navigate = useNavigate();
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

  // Interview learning materials (replaces the old Text Interview flow)
  const [materials, setMaterials] = useState(null);
  const [matCat, setMatCat] = useState("all");

  // Job Agent
  const [agentResult, setAgentResult] = useState(null);
  const [agentRole, setAgentRole] = useState("");
  const [agentLoc, setAgentLoc] = useState("");
  // const [otpMobile, setOtpMobile] = useState("");  // Phone OTP — commented out
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  // const confirmationRef = useRef(null);      // Phone OTP — commented out
  // const recaptchaRef = useRef(null);         // Phone OTP — commented out
  // const recaptchaWidgetIdRef = useRef(null); // Phone OTP — commented out
  const [applyingAll, setApplyingAll] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState(new Set());

  // Sync email from resume content whenever content loads/changes
  useEffect(() => {
    if (!content?.contact?.email) return;
    setOtpEmail(content.contact.email.trim());
  }, [content?.contact?.email]);

  /* Phone OTP — commented out
  useEffect(() => {
    if (!content?.contact?.phone) return;
    const raw = content.contact.phone.trim();
    const digits = raw.replace(/[\s\-\(\)]/g, "");
    const normalised = digits.startsWith("+") ? digits : `+91${digits}`;
    setOtpMobile(normalised);
  }, [content?.contact?.phone]);
  */

  const tools = [
    { id: "counseling", icon: "🤖", label: "Career Counseling" },
    { id: "interview", icon: "🎤", label: "Mock Interview" },
    { id: "agent", icon: "🚀", label: "AI Job Agent" },
    { id: "career-chat", icon: "💬", label: "Career Chat", href: "/career" },
  ];

  /* Phone OTP via Firebase reCAPTCHA — commented out
  const initRecaptcha = async () => {
    if (recaptchaRef.current) return;
    const el = document.getElementById("recaptcha-container");
    if (el) el.innerHTML = "";
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
  */

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

  // ---- Interview learning materials ----
  const loadMaterials = async () => {
    setLoading(true); setError(""); setMatCat("all");
    try { setMaterials(await api.interviewMaterials(content, interviewRole || null)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const downloadMaterials = () => {
    if (!materials?.download_markdown) return;
    const blob = new Blob([materials.download_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = materials.download_filename || "interview-prep.md";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const matCategories = materials
    ? ["all", ...Array.from(new Set(materials.solved_qa?.map(q => q.category) || []))]
    : ["all"];
  const filteredQa = (materials?.solved_qa || []).filter(
    q => matCat === "all" || q.category === matCat
  );

  const filteredQs = interviewQs?.questions?.filter(q =>
    filterCat === "all" || q.type === filterCat || q.category === filterCat
  ) || [];

  const answeredCount = Object.keys(ratings).length;
  const avgScore = answeredCount > 0 ? Math.round(Object.values(ratings).reduce((s, r) => s + (r.score || 0), 0) / answeredCount) : 0;

  // ---- Job Agent ----
  const runAgent = async () => {
    setLoading(true); setError(""); setOtpVerified(false); setOtpSent(false);
    setOtpError(""); setOtpCode(""); setAppliedJobs(new Set());
    // confirmationRef.current = null;  // Phone OTP — commented out
    // Phone OTP reCAPTCHA reset — commented out
    // if (recaptchaWidgetIdRef.current != null) {
    //   try { window.grecaptcha?.reset(recaptchaWidgetIdRef.current); } catch (_) {}
    // }
    try { setAgentResult(await api.jobAgent(content, agentRole || null, agentLoc || null)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  /* Phone OTP via Firebase — commented out
  const sendOtp_phone = async () => {
    // ... Firebase signInWithPhoneNumber flow removed ...
  };
  const verifyOtp_phone = async () => {
    // ... Firebase confirmationRef.confirm flow removed ...
  };
  */

  const sendOtp = async () => {
    setOtpError(""); setError("");
    const email = otpEmail.trim();
    if (!email || !email.includes("@")) {
      setOtpError("No valid email found. Edit the email field above."); return;
    }
    setOtpLoading(true);
    try {
      await api.sendEmailOtp(email);
      setOtpSent(true);
    } catch (e) {
      setOtpError(e.message || "Failed to send OTP. Check SMTP config.");
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    setOtpError("");
    if (!otpCode || otpCode.trim().length !== 6) { setOtpError("Enter the 6-digit OTP."); return; }
    setOtpLoading(true);
    try {
      await api.verifyEmailOtp(otpEmail.trim(), otpCode.trim());
      setOtpVerified(true);
    } catch (e) {
      const msg = e.message || "";
      if (msg.toLowerCase().includes("expired")) {
        setOtpError("OTP expired. Request a new one."); setOtpSent(false);
      } else {
        setOtpError(msg || "Verification failed. Check the code and try again.");
      }
    } finally { setOtpLoading(false); }
  };

  const resendOtp = () => { setOtpSent(false); setOtpCode(""); setOtpError(""); };

  const applyAll = async () => {
    setApplyingAll(true);
    const jobs = agentResult?.job_listings || [];
    for (let i = 0; i < jobs.length; i++) {
      // Open the real LinkedIn apply page for each role (one tab each).
      // LinkedIn has no auto-apply API, so a verified click finalises each.
      if (jobs[i]?.apply_url) window.open(jobs[i].apply_url, "_blank", "noopener,noreferrer");
      await new Promise(r => setTimeout(r, 600));
      setAppliedJobs(prev => new Set([...prev, i]));
    }
    setApplyingAll(false);
  };

  return (
    <div className="panel elite-panel">
      {/* Phone OTP — recaptcha container commented out
      <div id="recaptcha-container" style={{ position: "absolute", visibility: "hidden" }} />
      */}

      <h3>✨ Elite AI Tools</h3>
      <div className="ai-tools-grid">
        {tools.map(t => (
          <button key={t.id} className={`ai-tool-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => { if (t.href) { navigate(t.href); return; } setTab(t.id); setAudioMode(false); }} disabled={loading && tab !== t.id}>
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
            {loading && (
              <div className="chat-msg assistant">
                <div className="chat-bubble" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px" }}>
                  <SkeletonLine width="65%" height={16} />
                  <SkeletonLine width="85%" height={16} />
                  <SkeletonLine width="50%" height={16} />
                  <SkeletonLine width="70%" height={16} />
                </div>
              </div>
            )}
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
          ) : !materials ? (
            /* Start screen */
            <div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
                Prepare with curated study material and solved questions & answers, or practice live with the AI audio interviewer.
              </p>
              <div className="field"><label>Target Role</label>
                <input value={interviewRole} onChange={e => setInterviewRole(e.target.value)}
                  placeholder={content?.contact?.title || "e.g. Senior Software Engineer"} />
              </div>

              <div className="interview-mode-cards">
                {/* Learning Materials (replaces Text Interview) */}
                <div className="mode-card">
                  <div className="mode-icon">📚</div>
                  <h4>Learning Materials</h4>
                  <p>Curated study resources + solved Q&A you can read and download.</p>
                  <button className="btn btn-primary" onClick={loadMaterials} disabled={loading} style={{ width: "100%" }}>
                    {loading ? "Loading…" : "Open Learning Materials"}
                  </button>
                  {loading && (
                    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <SkeletonLine width="100%" height={16} />
                      <SkeletonLine width="85%" height={16} />
                      <SkeletonLine width="70%" height={16} />
                    </div>
                  )}
                </div>

                {/* Audio Mode (unchanged) */}
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
            /* Learning materials view */
            <div>
              <div className="interview-header">
                <h4>📚 {materials.role} — Interview Prep</h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={downloadMaterials}>⬇ Download (.md)</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMaterials(null)}>Back</button>
                </div>
              </div>

              {/* Study resources */}
              <div className="agent-section">
                <h4>🔗 Study Resources</h4>
                {materials.resources?.map((r, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.topic}</div>
                    <div className="agent-links">
                      {r.items?.map((it, k) => (
                        <a key={k} href={it.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">{it.name} →</a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Solved Q&A */}
              <div className="agent-section">
                <h4>📝 Solved Questions & Answers ({materials.total_questions})</h4>
                {materials.source === "ai_skill_based" && materials.skills_used?.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                    ✨ Tailored to your resume skills: {materials.skills_used.join(", ")}
                  </p>
                )}
                {materials.source === "curated_fallback" && (
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                    Showing a curated set (connect an AI key for questions generated from your skills).
                  </p>
                )}
                <div className="cat-filter">
                  {matCategories.map(c => (
                    <button key={c} className={`cat-btn ${matCat === c ? "active" : ""}`} onClick={() => setMatCat(c)}>
                      {c === "all" ? `All (${materials.solved_qa?.length || 0})` : `${c} (${materials.solved_qa?.filter(q => q.category === c).length})`}
                    </button>
                  ))}
                </div>
                {filteredQa.map((qa, i) => (
                  <div key={i} className="interview-q">
                    <div className="q-header">
                      <span className="q-type">{qa.category}</span>
                      <span className="q-num">Q{i + 1}</span>
                    </div>
                    <p className="q-text">{qa.question}</p>
                    <div className="suggested-answer"><strong>Answer:</strong><p>{qa.answer}</p></div>
                  </div>
                ))}
              </div>
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
          ) : loading ? (
            <div>
              <SkeletonLine width={220} height={22} style={{ marginBottom: 20 }} />
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {[1, 2, 3].map((i) => <SkeletonBlock key={i} width={120} height={38} borderRadius={8} />)}
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e2dccf", borderRadius: 12, padding: 18, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <SkeletonLine width="55%" height={18} />
                  <SkeletonLine width="40%" height={14} />
                  <SkeletonLine width="80%" height={14} />
                  <SkeletonLine width="65%" height={14} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="interview-header">
                <h4>Jobs for {agentResult.target_role}</h4>
                <button className="btn btn-ghost btn-sm" onClick={() => setAgentResult(null)}>New Search</button>
              </div>

              <div className="agent-section">
                <h4>🔗 Search on LinkedIn</h4>
                <div className="agent-links">
                  {agentResult.job_sources?.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">{s.icon} {s.platform}</a>
                  ))}
                </div>
                {agentResult.apply_note && (
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>ℹ️ {agentResult.apply_note}</p>
                )}
              </div>

              <div className="agent-section">
                <h4>📋 LinkedIn Jobs ({agentResult.job_listings?.length})</h4>
                {!otpVerified ? (
                  <div className="otp-section">
                    <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>🔐 Verify email before applying.</p>
                    {!otpSent ? (
                      <div>
                        <div className="otp-row">
                          <input value={otpEmail} onChange={e => setOtpEmail(e.target.value)} placeholder="email@example.com" style={{ flex: 1 }} disabled={otpLoading} />
                          <button className="btn btn-primary btn-sm" onClick={sendOtp} disabled={otpLoading || !otpEmail.trim()}>
                            {otpLoading ? "Sending…" : "Send OTP"}
                          </button>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>OTP sent via Email · 5 min expiry</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 13, marginBottom: 8 }}>📧 OTP sent to <strong>{otpEmail}</strong></p>
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
                    <div className="otp-verified">✅ Email verified: {otpEmail}</div>
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
                      {job.easy_apply && <span className="gd-badge" style={{ background: "#0a66c2", color: "#fff" }}>⚡ Easy Apply</span>}
                    </div>
                    <p className="job-match">{job.match_reason}</p>
                    <div className="job-location">📍 {job.location}</div>
                    <div className="company-links" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
                      {job.apply_url && <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="job-link linkedin">Apply on LinkedIn →</a>}
                      {job.cover_letter && (
                        <button className="job-link" style={{ background: "#57514a", border: "none", cursor: "pointer" }}
                          onClick={() => navigator.clipboard.writeText(job.cover_letter)}>📋 Copy cover letter</button>
                      )}
                    </div>
                    {appliedJobs.has(i) && <div className="job-applied-badge">✅ Application opened</div>}
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
