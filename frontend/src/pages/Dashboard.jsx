import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import SubscriptionModal from "../components/SubscriptionModal.jsx";
import { emptyResume } from "../lib";
import AdSlot from "../components/AdSlot.jsx";

export default function Dashboard() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newYears, setNewYears] = useState(3);
  const [newName, setNewName] = useState("");
  const [siteStats, setSiteStats] = useState({ total_resumes: null, ats_pass_rate: null });
  const fileRef = useRef();

  const load = () => {
    api.listResumes().then(setResumes).catch((e) => setError(e.message)).finally(() => setLoading(false));
    api.subscriptionStatus().then(setSubStatus).catch(() => {});
  };

  useEffect(() => {
    load();
    api.getPublicStats().then(setSiteStats).catch(() => {});
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
    setBusy(true); setError("");
    try {
      const r = await api.uploadResume(file, file.name.replace(/\.[^.]+$/, ""));
      navigate(`/editor/${r.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const remove = async (id) => {
    if (!confirm("Delete this resume?")) return;
    setResumes((prev) => prev.filter((r) => r.id !== id));
    try { await api.deleteResume(id); } catch { load(); }
  };

  const isSubscribed = subStatus?.is_subscribed;
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
            ResumeGPT uses AI to help you create ATS-optimized resumes, practice interviews,
            get career roadmaps, and land your dream job — all in one platform.
          </p>
          <ul style={{ textAlign: "left", display: "inline-block", margin: "0 0 24px", padding: "0 0 0 20px", color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 2 }}>
            <li>✅ ATS score checker — see how recruiters' systems rate your resume</li>
            <li>✅ AI-powered resume rewriting with 3 strategic variants</li>
            <li>✅ 30 professional templates — PDF &amp; DOCX download</li>
            <li>✅ Mock interview practice with instant AI scoring</li>
            <li>✅ Job search agent — LinkedIn, Naukri, Indeed, RemoteJobs.in</li>
            <li>✅ Cover letter generator tailored to every job</li>
          </ul>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowNewModal(true)}>
              + Create New Resume
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

      {/* ── Side-ad wrapper ── */}
      <div className="side-ad-wrapper" style={{ display: "flex", alignItems: "flex-start", maxWidth: 1380, margin: "0 auto", padding: "0 8px" }}>

        {/* Left vertical ad */}
        <div className="ad-col-left" style={{ flexShrink: 0, padding: "24px 10px 0" }}>
          <AdSlot slot="1111111111" format="vertical" />
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
            <h2 className="section-title">Why Indian Professionals Choose ResumeGPT</h2>
            <p style={{ color: "#57514a", fontSize: 15, lineHeight: 1.8, maxWidth: 720, margin: "0 auto 20px" }}>
              ResumeGPT is India's most intelligent AI resume builder — designed specifically for the Indian job market.
              Whether you're a fresher applying to your first job, a mid-career professional targeting a switch, or a senior
              executive pursuing leadership roles, our platform gives you every tool to stand out.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
              {[
                { stat: statResumes, label: "Resumes Created" },
                { stat: statAts, label: "ATS Pass Rate" },
                { stat: "30+", label: "Professional Templates" },
                { stat: "₹1,999", label: "One-time Lifetime Plan" },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #e2dccf" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#b45309" }}>{s.stat}</div>
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
                <button className="btn btn-ghost" style={{ width: "100%" }} disabled>Current Plan</button>
              </div>
              <div className={`plan-box elite ${isSubscribed ? "current" : ""}`}>
                <div className="plan-box-popular">✨ LIFETIME ACCESS</div>
                <div className="plan-box-name">Elite</div>
                <div className="plan-box-price"><span>₹</span>1,999</div>
                <div className="plan-box-period">one-time · lifetime</div>
                <ul className="plan-box-features">
                  <li>✓ Everything in Free</li>
                  <li>✓ Job search & Posting agent</li>
                  <li>✓ 🤖 AI Career Counseling Bot</li>
                  <li>✓ 🎤 Mock Interview Practice</li>
                  <li>✓ 📊 Interview Gap Analysis</li>
                  <li>✓ 🚀 AI Job Application Agent</li>
                  <li>✓ Priority support &amp; early access</li>
                </ul>
                {isSubscribed ? (
                  <button className="btn btn-ghost" style={{ width: "100%" }} disabled>✓ Subscribed</button>
                ) : (
                  <button className="btn btn-primary" style={{ width: "100%", background: "linear-gradient(135deg, #d97706, #b45309)" }}
                    onClick={() => setShowSub(true)}>Subscribe — ₹1,999</button>
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
                <div key={i} className={`elite-feature-card ${f.status}`} onClick={() => { if (f.status === "locked") setShowSub(true); }}>
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
                { q: "Is ResumeGPT free to use?", a: "Yes! Creating resumes, using the AI analysis, career roadmap, and ATS scorer are completely free. A one-time Elite payment (₹1,999) unlocks career counselling, mock interviews, Interview GAP analysis, Job Posting via Agent and Priority support & early access." },
                { q: "How does the ATS score work?", a: "Our ATS engine uses a 100-point rubric scoring your resume on contact completeness, summary quality, experience bullet strength, skills coverage, education, and keyword match. Every deduction comes with a specific fix." },
                { q: "Can I import my existing resume?", a: "Yes — upload any PDF or DOCX resume and we'll parse it into an editable format. You can then enhance it, switch templates, and download a polished version." },
                { q: "Does it work for freshers with no experience?", a: "Absolutely. Our AI generates a strong entry-level resume based on your name, target role, and years of experience (0 works!). It includes a strong objective, education section, and relevant skills." },
                { q: "Is my resume data safe?", a: "Your data is stored securely and never sold or shared with third parties. You can delete your account and all data at any time." },
              ].map((faq, i) => (
                <details key={i} style={{ borderBottom: "1px solid #e2dccf", padding: "14px 0" }}>
                  <summary style={{ fontWeight: 600, cursor: "pointer", fontSize: 15, color: "#1c1a17" }}>{faq.q}</summary>
                  <p style={{ color: "#57514a", fontSize: 14, lineHeight: 1.7, margin: "10px 0 4px", paddingLeft: 16 }}>{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

        </div>{/* end main content */}

        {/* Right vertical ad */}
        <div className="ad-col-right" style={{ flexShrink: 0, padding: "24px 10px 0" }}>
          <AdSlot slot="2222222222" format="vertical" />
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
    </>
  );
}
