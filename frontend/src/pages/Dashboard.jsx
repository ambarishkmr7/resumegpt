import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import SubscriptionModal from "../components/SubscriptionModal.jsx";
import AdCarousel from "../components/AdCarousel.jsx";
import { SkeletonLine, SkeletonBlock } from "../components/Skeleton.jsx";
import ProcessingOverlay from "../components/ProcessingOverlay.jsx";
import "../../public/css/style.css";
function DashboardSkeleton() {
  return (
    <>
      <Topbar />
      {/* Hero skeleton */}
      <section className="hero">
        <div className="hero-inner" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <SkeletonBlock width="60%" height={40} borderRadius={8} />
          <SkeletonBlock width="85%" height={20} borderRadius={6} />
          <SkeletonBlock width="75%" height={20} borderRadius={6} />
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <SkeletonBlock width={200} height={52} borderRadius={12} />
            <SkeletonBlock width={200} height={52} borderRadius={12} />
          </div>
        </div>
      </section>
      <div className="side-ad-wrapper" style={{ display: "flex", maxWidth: 1380, margin: "0 auto", padding: "0 8px" }}>
        <div className="container" style={{ flex: 1, minWidth: 0 }}>
          {/* Resume grid skeleton */}
          <section className="section">
            <SkeletonBlock width={160} height={30} borderRadius={6} style={{ marginBottom: 20 }} />
            <div className="resume-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="resume-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <SkeletonLine width="75%" height={20} />
                  <SkeletonLine width="55%" height={14} />
                  <SkeletonLine width="45%" height={14} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <SkeletonBlock width={70} height={34} borderRadius={8} />
                    <SkeletonBlock width={70} height={34} borderRadius={8} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          {/* Stats skeleton */}
          <section className="section" style={{ background: "#fffdf8", borderRadius: 16, padding: "32px 28px", border: "1px solid #e2dccf" }}>
            <SkeletonBlock width="55%" height={28} borderRadius={6} style={{ marginBottom: 16 }} />
            <SkeletonBlock width="85%" height={18} borderRadius={4} style={{ marginBottom: 10 }} />
            <SkeletonBlock width="75%" height={18} borderRadius={4} style={{ marginBottom: 24 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ textAlign: "center", padding: 20, background: "#fff", borderRadius: 12, border: "1px solid #e2dccf", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <SkeletonBlock width={80} height={36} borderRadius={6} />
                  <SkeletonLine width="65%" height={14} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newYears, setNewYears] = useState(3);
  const [newName, setNewName] = useState("");
  const [siteStats, setSiteStats] = useState({ total_resumes: null, ats_pass_rate: null });
  const [profilePct, setProfilePct] = useState(0);
  const fileRef = useRef();

  const load = () => {
    api.listResumes().then(setResumes).catch((e) => setError(e.message)).finally(() => setLoading(false));
    api.subscriptionStatus().then(setSubStatus).catch(() => {});
    api.getProfile().then((p) => setProfilePct(p.profile_completion ?? 0)).catch(() => {});
  };

  useEffect(() => {
    load();
    api.getPublicStats().then(setSiteStats).catch(() => {});

    const pendingStr = sessionStorage.getItem("pending_action");
    if (pendingStr) {
      sessionStorage.removeItem("pending_action");
      try {
        const pending = JSON.parse(pendingStr);
        if (pending.type === "create" && pending.title && pending.name) {
          api.generateSample(pending.title, pending.years ?? 3, pending.name)
            .then((sample) => api.createResume({
              title: `${pending.name} - ${pending.title}`,
              template_id: "modern",
              content: sample,
            }))
            .then((r) => navigate(`/editor/${r.id}`))
            .catch(() => {});
        } else if (pending.type === "import" && pending.fileData && pending.fileName) {
          fetch(pending.fileData)
            .then((res) => res.blob())
            .then((blob) => {
              const file = new File([blob], pending.fileName, { type: blob.type });
              return api.uploadResume(file, pending.fileName.replace(/\.[^.]+$/, ""));
            })
            .then((r) => navigate(`/editor/${r.id}`))
            .catch(() => {});
        }
      } catch { /* ignore malformed pending action */ }
    }
  }, []);

  const createBlank = async () => {
    if (!newTitle.trim() || !newName.trim()) return;
    setBusy(true); setError("");
    try {
      const sample = await api.generateSample(newTitle.trim(), newYears, newName.trim());
      const r = await api.createResume({ title: `${newName.trim()} - ${newTitle.trim()}`, template_id: "modern", content: sample });
      setShowNewModal(false); navigate(`/editor/${r.id}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setUploading(true); setError("");
    try {
      const r = await api.uploadResume(file, file.name.replace(/\.[^.]+$/, ""));
      navigate(`/editor/${r.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); setUploading(false); e.target.value = ""; }
  };

  const remove = async (id) => {
    if (!confirm("Delete this resume?")) return;
    setResumes((prev) => prev.filter((r) => r.id !== id));
    try { await api.deleteResume(id); } catch { load(); }
  };

  if (loading) return <DashboardSkeleton />;

  const isSubscribed = !!(subStatus?.is_subscribed && subStatus?.payment_id);
  const statResumes = siteStats.total_resumes !== null ? siteStats.total_resumes.toLocaleString("en-IN") : "…";
  const statAts = siteStats.ats_pass_rate !== null ? `${siteStats.ats_pass_rate}%` : "…";


  return (
    <>
      <Topbar />

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <h1>Build Your Dream Resume with AI</h1>
          <p className="hero-sub">
            resumesGPT uses AI to help you create ATS-optimized resumes, practice interviews,
            get career roadmaps, and land your dream job — all in one platform.
          </p>
          <ul className="feature-list">
            <li>✅ Free ATS score checker — see how recruiters rate resume</li>
            <li>✅ Free AI-powered resume rewriting with 3 strategic variants</li>
            <li>✅ Free 30 professional templates — PDF &amp; DOCX download</li>
            <li>✅ Mock interview practice with instant AI scoring</li>
            <li>✅ Job search agent — LinkedIn, Naukri, Indeed, RemoteJobs.in</li>
            <li>✅ Free Cover letter generator tailored to every job</li>
          </ul>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowNewModal(true)}>
              + Create New Resume
            </button>
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => navigate("/jobs")}
              style={{ background: "#fff8ed", color: "#b45309", borderColor: "#f9d087" }}
            >
              💼 Find Jobs
            </button>
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => fileRef.current.click()}
              style={{ background: "#fff", color: "#1c1a17", borderColor: "#fff" }}
            >
              📄 Import PDF / DOCX
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.docx" hidden onChange={onUpload} />
          </div>
        </div>
      </section>

      {/* ── Profile Section ── always visible ── */}
      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "0 8px" }}>
        <div className="dash-profile-card" onClick={() => navigate("/profile")}>
          {/* circular progress ring */}
          <svg width="60" height="60" viewBox="0 0 60 60" style={{ flexShrink: 0 }}>
            <circle cx="30" cy="30" r="26" fill="none" stroke="#e2dccf" strokeWidth="5" />
            <circle
              cx="30" cy="30" r="26" fill="none"
              stroke={profilePct >= 70 ? "#22c55e" : profilePct >= 40 ? "#f59e0b" : "#ef4444"}
              strokeWidth="5"
              strokeDasharray={`${(profilePct / 100) * 163.4} 163.4`}
              strokeLinecap="round"
              transform="rotate(-90 30 30)"
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
            <text x="30" y="35" textAnchor="middle" fontSize="13" fontWeight="700"
              fill={profilePct >= 70 ? "#22c55e" : profilePct >= 40 ? "#f59e0b" : "#ef4444"}
              fontFamily="var(--display)">
              {profilePct}%
            </text>
          </svg>

          {/* text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--display)", color: "var(--ink,#1c1a17)", marginBottom: 3 }}>
              {profilePct === 100
                ? "✅ Profile 100% complete — you'll get the best job matches!"
                : profilePct === 0
                ? "Complete your profile to get personalised job recommendations"
                : `Your profile is ${profilePct}% complete`}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-soft,#57514a)", lineHeight: 1.5 }}>
              {profilePct < 40
                ? "Add your personal details, experience, skills and career preferences to unlock better job matches."
                : profilePct < 70
                ? "You're making progress! Fill in the remaining sections to unlock personalised recommendations."
                : profilePct < 100
                ? "Almost there! A few more details for a fully optimised profile."
                : "Your profile is fully set up. Click to review or update your details anytime."}
            </div>
          </div>

          {/* CTA */}
          <div style={{ flexShrink: 0 }}>
            <span
              className={`btn btn-sm ${profilePct === 100 ? "btn-ghost" : "btn-primary"}`}
              style={{ whiteSpace: "nowrap" }}
            >
              {profilePct === 0 ? "Set Up Profile →" : profilePct === 100 ? "Edit Profile" : "Complete Profile →"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Side-ad wrapper ── */}
      <div className="side-ad-wrapper" style={{ display: "flex", alignItems: "flex-start", maxWidth: 1380, margin: "0 auto", padding: "0 8px" }}>

        {/* Left vertical ad */}
        <div className="ad-col-left" style={{ flexShrink: 0, padding: "24px 10px 0" }}>
          <AdCarousel />
        </div>

        {/* Main content */}
        <div className="container" style={{ flex: 1, minWidth: 0 }}>

          {error && <div className="error">{error}</div>}

          {/* My Resumes */}
          {!loading && resumes.length > 0 && (
            <section className="section">
              <h2 className="section-title">My Resumes</h2>
              <div className="resume-grid">
                {resumes.map((r) => (
                  <div className="resume-card" key={r.id}>
                    <div className="rc-title">{r.title || "Untitled"}</div>
                    <div className="rc-meta">{r.template_id} · ATS {r.ats_score ?? "—"}</div>
                    <div className="rc-meta">Updated {new Date(r.updated_at).toLocaleDateString()}</div>
                    <div className="rc-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/editor/${r.id}`)}>Edit</button>
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => remove(r.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Stats */}
          <section className="section" style={{ background: "#fffdf8", borderRadius: 16, padding: "32px 28px", border: "1px solid #e2dccf" }}>
            <h2 className="section-title">Why Indian Professionals Choose resumesGPT</h2>
            <p style={{ color: "#57514a", fontSize: 15, lineHeight: 1.8, maxWidth: 720, margin: "0 auto 20px" }}>
              resumesGPT is India's most intelligent AI resume builder — designed specifically for the Indian job market.
              Whether you're a fresher applying to your first job, a mid-career professional targeting a switch, or a senior
              executive pursuing leadership roles, our platform gives you every tool to stand out.
            </p>
            <div className="stats-grid-inner">
              {[
                { stat: statResumes, label: "Resumes Created" },
                { stat: statAts, label: "ATS Pass Rate" },
                { stat: "30+", label: "Professional Templates" },
                { stat: "₹1,999", label: "One-time Lifetime Plan" },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #e2dccf" }}>
                  <div className="stat-number" style={{ fontSize: 28, fontWeight: 800, color: "#b45309" }}>{s.stat}</div>
                  <div style={{ fontSize: 13, color: "#57514a", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Features */}
          <section className="section">
            <h2 className="section-title">Powerful Features</h2>
            <div className="features-grid">
              {[
                { icon: "📄", title: "Smart Resume Builder", desc: "30 professional templates with drag-and-drop section reordering. Upload existing resumes (PDF/DOCX) or create from scratch." },
                { icon: "🎯", title: "ATS Score Optimization", desc: "Real-time ATS scoring with a 100-point rubric. Get specific suggestions to reach 100% and beat applicant tracking systems." },
                { icon: "🤖", title: "AI-Powered Improvements", desc: "One-click AI rewrite generates 3 strategic resume variants. Smart bullet point enhancement with metrics and action verbs." },
                { icon: "🗺️", title: "Career Roadmap", desc: "Personalized career path with certification recommendations, YouTube learning channels, and course links from Scaler, Coursera, Udemy." },
                { icon: "💼", title: "Job Search Agent", desc: "AI finds matching companies with direct LinkedIn, Naukri, Indeed, and RemoteJobs.in links. Glassdoor ratings included." },
                { icon: "📝", title: "Cover Letter Generator", desc: "AI-crafted cover letters tailored to each job. Professional writeups for LinkedIn, Naukri, and portfolio." },
                { icon: "📊", title: "Career Analysis", desc: "Deep analysis of your resume's strengths, weaknesses, and impact. Skill gap identification across 5 categories." },
                { icon: "📎", title: "Reference Resume Import", desc: "Upload someone else's resume as reference to enrich your skills, certifications, and competencies." },
              ].map((f, i) => (
                <div key={i} className="feature-card">
                  <div className="feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Plans */}
          <section className="section">
            <h2 className="section-title">Choose Your Plan</h2>
            <p className="section-sub">One-time payment. Lifetime access. No recurring charges.</p>
            <div className="plans-row two-col">
              <div className="plan-box">
                <div className="plan-box-name">Free</div>
                <div className="plan-box-price"><span>₹</span>0</div>
                <div className="plan-box-period">forever</div>
                <ul className="plan-box-features">
                  <li>✓ Create &amp; edit unlimited resumes</li>
                  <li>✓ 30 professional templates</li>
                  <li>✓ ATS scoring &amp; suggestions</li>
                  <li>✓ AI career analysis</li>
                  <li>✓ Career roadmap</li>
                  <li>✓ PDF / DOCX download</li>
                  <li>✓ AI resume rewriting</li>
                  <li>✓ Cover letter generator</li>
                  <li>✓ AI tools (Career Analysis, Career Roadmap, Job Search, Trending jobs)</li>
                </ul>
                {isSubscribed ? (
                  <button className="btn btn-ghost" style={{ width: "100%" }} disabled>Free Plan</button>
                ) : (
                  <button className="btn btn-ghost" style={{ width: "100%" }} disabled>✓ Current Plan</button>
                )}
              </div>
              <div className={`plan-box elite ${isSubscribed ? "current" : ""}`}>
                <div className="plan-box-popular">✨ LIFETIME ACCESS</div>
                <div className="plan-box-name">Elite</div>
                <div className="plan-box-price"><span>₹</span>1,999</div>
                <div className="plan-box-period">one-time · lifetime</div>
                <ul className="plan-box-features">
                  <li>✓ Everything in Free</li>
                  <li>✓ Job search &amp; Posting agent</li>
                  <li>✓ 🤖 AI Career Counseling Bot</li>
                  <li>✓ 🎤 Mock Interview Practice</li>
                  <li>✓ 📊 Interview Gap Analysis</li>
                  <li>✓ 🚀 AI Job Application Agent</li>
                  <li>✓ Priority support &amp; early access</li>
                </ul>
                {isSubscribed ? (
                  <button className="btn btn-ghost" style={{ width: "100%" }} disabled>✓ Current Plan</button>
                ) : (
                  <button className="btn btn-primary" style={{ width: "100%", background: "linear-gradient(135deg, #d97706, #b45309)" }}
                    onClick={() => navigate("/page/subscription")}>Subscribe — ₹1,999</button>
                )}
              </div>
            </div>
          </section>

          {/* Elite features */}
          <section className="section">
            <h2 className="section-title">✨ Elite AI Features</h2>
            <p className="section-sub">Advanced AI-powered career tools available in the Elite plan.</p>
            <div className="elite-features-grid">
              {[
                { icon: "🤖", title: "AI Career Counseling Bot", desc: "Interactive AI career counselor that understands your resume, skills, and goals. Get personalized advice on salary negotiation, career transitions, upskilling, and job search strategy. Multi-turn conversations with context.", status: isSubscribed ? "active" : "locked" },
                { icon: "🎤", title: "Mock Interview Practice", desc: "AI generates role-specific interview questions (behavioral, technical, situational) tailored to your resume. Practice your answers and get instant feedback with scoring.", status: isSubscribed ? "active" : "locked" },
                { icon: "📊", title: "Interview Rating & Gap Analysis", desc: "Each mock interview answer is scored 0-100 with detailed strengths, gaps, and a suggested ideal answer with references from industry-standard guides like 'Cracking the Coding Interview'.", status: isSubscribed ? "active" : "locked" },
                { icon: "🚀", title: "AI Job Application Agent", desc: "AI agent searches relevant jobs across LinkedIn, Naukri, Indeed, and RemoteJobs.in. Generates tailored cover letters and prepares professional answers to common recruiter questions.", status: isSubscribed ? "active" : "locked" },
              ].map((f, i) => (
                <div key={i} className={`elite-feature-card ${f.status}`} onClick={() => { if (f.status === "locked") navigate("/page/subscription"); }}>
                  <div className="ef-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                  {f.status === "locked" && <div className="ef-lock">🔒 Subscribe to Elite to unlock</div>}
                  {f.status === "active" && <div className="ef-active">✅ Available — open any resume to use</div>}
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="section">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              {[
                { q: "Is resumesGPT free to use?", a: "Yes! Creating resumes, using the AI analysis, career roadmap, and ATS scorer are completely free. A one-time Elite payment (₹1,999) unlocks career counselling, mock interviews, Interview GAP analysis, Job Posting via Agent and Priority support & early access." },
                { q: "How does the ATS score work?", a: "Our ATS engine uses a 100-point rubric scoring your resume on contact completeness, summary quality, experience bullet strength, skills coverage, education, and keyword match. Every deduction comes with a specific fix." },
                { q: "Can I import my existing resume?", a: "Yes — upload any PDF or DOCX resume and we'll parse it into an editable format. You can then enhance it, switch templates, and download a polished version." },
                { q: "Does it work for freshers with no experience?", a: "Absolutely. Our AI generates a strong entry-level resume based on your name, target role, and years of experience (0 works!). It includes a strong objective, education section, and relevant skills." },
                { q: "Is my resume data safe?", a: "Your data is stored securely and never sold or shared with third parties. You can delete your account and all data at any time." },
              ].map((faq, i) => (
                <details key={i} className="faq-details" style={{ borderBottom: "1px solid #e2dccf", padding: "14px 0" }}>
                  <summary style={{ fontWeight: 600, cursor: "pointer", fontSize: 15, color: "#1c1a17" }}>{faq.q}</summary>
                  <p style={{ color: "#57514a", fontSize: 14, lineHeight: 1.7, margin: "10px 0 4px", paddingLeft: 16 }}>{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

        </div>{/* end main content */}

        {/* Right vertical ad */}
        <div className="ad-col-right" style={{ flexShrink: 0, padding: "24px 10px 0" }}>
          <AdCarousel />
        </div>

      </div>{/* end side-ad wrapper */}

      <Footer />

      {/* Modals */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3>Create New Resume</h3>
            <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 16 }}>
              We'll generate a professional sample resume for you to customize.
            </p>
            <div className="field">
              <label>Your Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Amit Sharma" autoFocus />
            </div>
            <div className="field">
              <label>Target Job Title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div className="field">
              <label>Years of Experience</label>
              <input type="number" min={0} max={30} value={newYears} onChange={(e) => setNewYears(parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={createBlank}
                disabled={busy || !newTitle.trim() || !newName.trim()}>
                {busy ? "Generating…" : "Generate Resume"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowNewModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSub && (
        <SubscriptionModal
          onClose={() => setShowSub(false)}
          onSuccess={() => { setShowSub(false); load(); }}
        />
      )}

      <ProcessingOverlay visible={uploading} />

      <style>{`
        /* ── Profile completion card: stack on mobile ── */
        @media (max-width: 640px) {
          .profile-completion-card {
            flex-direction: column;
            text-align: center;
            gap: 12px;
            padding: 14px 16px !important;
          }
          .profile-completion-card > svg {
            margin: 0 auto;
          }
          .profile-completion-card .btn {
            width: 100%;
          }
        }

        /* ── Profile card (always visible above My Resumes) ── */
        .dash-profile-card {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 18px 24px;
          background: #fff;
          border: 1px solid #e2dccf;
          border-radius: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          cursor: pointer;
          margin-bottom: 18px;
          transition: box-shadow 0.2s, transform 0.15s;
          text-decoration: none;
        }
        .dash-profile-card:hover {
          box-shadow: 0 6px 20px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        @media (max-width: 640px) {
          .dash-profile-card {
            flex-wrap: wrap;
            gap: 14px;
            padding: 16px;
          }
          .dash-profile-card > svg { display: none; }
          .dash-profile-card .btn { width: 100%; text-align: center; }
        }

        /* ── Stats grid inside dashboard ── */
        .stats-grid-inner {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        @media (max-width: 640px) {
          .stats-grid-inner {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
        }
        @media (max-width: 480px) {
          .stats-grid-inner {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .stats-grid-inner > div {
            padding: 10px !important;
          }
          .stats-grid-inner .stat-number {
            font-size: 22px !important;
          }
        }

        /* ── Hero list: smaller on mobile ── */
        @media (max-width: 480px) {
          .hero ul {
            font-size: 12px !important;
            line-height: 1.6 !important;
            padding-left: 16px !important;
          }
        }

        /* ── FAQ details: tighter on mobile ── */
        @media (max-width: 480px) {
          .faq-details summary {
            font-size: 14px !important;
          }
          .faq-details p {
            font-size: 13px !important;
          }
        }
      `}</style>
    </>
  );
}
