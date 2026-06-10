import { useState } from "react";
import { api } from "../api/client";

export default function AIToolsPanel({ content, onApplyVariant }) {
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState(null);
  const [roadmap,  setRoadmap]    = useState(null);
  const [trending, setTrending]   = useState(null);
  const [writeup,  setWriteup]    = useState(null);
  const [writeupPurpose, setWriteupPurpose] = useState("linkedin");
  const [variants, setVariants]   = useState(null);
  const [jobDesc,     setJobDesc]     = useState("");
  const [targetRole,  setTargetRole]  = useState("");
  const [error, setError] = useState("");

  const run = async (tab, fn) => {
    setActiveTab(tab); setLoading(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const tools = [
    { id: "analysis", icon: "🔍", label: "Career Analysis",
      action: () => run("analysis", async () => setAnalysis(await api.analyze(content, jobDesc || null))) },
    { id: "roadmap",  icon: "🗺️", label: "Career Roadmap",
      action: () => run("roadmap",  async () => setRoadmap(await api.roadmap(content, targetRole || null))) },
    { id: "trending", icon: "🔥", label: "Trending Jobs",
      action: () => run("trending", async () => setTrending(await api.trendingJobs(content))) },
    { id: "writeup",  icon: "✍️", label: "Pro Writeup",
      action: () => run("writeup",  async () => { const r = await api.writeup(content, writeupPurpose); setWriteup(r.writeup); }) },
    { id: "rewrite",  icon: "🔄", label: "AI Rewrite", hidden: true,
      action: () => run("rewrite",  async () => { const r = await api.rewrite(content, jobDesc || null, 3); setVariants(r.variants); }) },
  ];

  return (
    <div className="panel ai-tools-panel">
      <h3>Tools</h3>
      <div className="ai-tools-grid">
        {tools.filter(t => !t.hidden).map((t) => (
          <button key={t.id} className={`ai-tool-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={t.action} disabled={loading}>
            <span className="ai-tool-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Context inputs */}
      {(activeTab === "analysis" || activeTab === "rewrite") && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Job description (optional — for targeted analysis)</label>
          <textarea rows={2} value={jobDesc} onChange={(e) => setJobDesc(e.target.value)}
            placeholder="Paste a job description for targeted analysis…" />
        </div>
      )}
      {activeTab === "roadmap" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Target role (optional)</label>
          <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Engineering Manager, VP Engineering…" />
        </div>
      )}
      {activeTab === "writeup" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Writeup purpose</label>
          <select value={writeupPurpose} onChange={(e) => setWriteupPurpose(e.target.value)}>
            <option value="linkedin">LinkedIn About</option>
            <option value="naukri">Naukri Profile Summary</option>
            <option value="portfolio">Portfolio Introduction</option>
            <option value="bio">Professional Bio</option>
          </select>
        </div>
      )}

      {loading && (
        <div className="ai-loading">
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <div>Analyzing with AI…</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>This may take 10-15 seconds</div>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {/* ══════════ CAREER ANALYSIS ══════════ */}
      {!loading && analysis && activeTab === "analysis" && (
        <div className="ai-result">

          {/* Strengths */}
          <div className="ai-section">
            <h4>💪 Strengths</h4>
            <ul>
              {analysis.strengths?.map((s, i) => (
                <li key={i} className="ai-good" style={{ marginBottom: 6, lineHeight: 1.5 }}>{s}</li>
              ))}
            </ul>
          </div>

          {/* Areas for Improvement — rich cards */}
          <div className="ai-section">
            <h4>🎯 Areas for Improvement</h4>
            {analysis.weaknesses?.map((w, i) => (
              <ImprovementCard key={i} text={w} index={i} />
            ))}
          </div>

          {/* Recommendations — numbered with explanation */}
          <div className="ai-section">
            <h4>✅ Recommendations</h4>
            {analysis.recommendations?.map((r, i) => (
              <RecommendationCard key={i} text={r} index={i} />
            ))}
          </div>

          {/* Overall */}
          <div className="ai-section">
            <h4>📊 Overall Assessment</h4>
            <div style={{
              background: "linear-gradient(135deg, #fffdf8, #f6f3ec)",
              border: "1px solid #e2dccf", borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.8
            }}>
              {analysis.overall_assessment}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CAREER ROADMAP ══════════ */}
      {!loading && roadmap && activeTab === "roadmap" && (
        <div className="ai-result">

          <div className="ai-section">
            <h4>📍 Current Level</h4>
            <p className="ai-highlight">{roadmap.current_level}</p>
          </div>

          <div className="ai-section">
            <h4>🚀 Next Career Milestones</h4>
            {roadmap.next_roles?.map((r, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                background: "#fff", border: "1px solid #e2dccf", borderRadius: 9,
                padding: "10px 14px", marginBottom: 8
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>
                  {["🥈", "🥇", "🏆", "👑"][i] || "⭐"}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                    {["Typically requires 1-2 years of growth in current role",
                      "Cross-team leadership and system ownership required",
                      "Strategic influence, architecture decisions, team building",
                      "Executive-level scope and org-wide impact"][i] || "Continued growth and specialization"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="ai-section">
            <h4>🗺️ Detailed Roadmap</h4>
            {roadmap.roadmap_steps?.map((s, i) => (
              <RoadmapStep key={i} text={s} index={i} />
            ))}
          </div>

          <div className="ai-section">
            <h4>📜 Recommended Certifications</h4>
            {roadmap.recommended_certifications?.map((cert, i) => (
              <div key={i} className="cert-card">
                {typeof cert === "string" ? (
                  <div className="cert-name">{cert}</div>
                ) : (
                  <>
                    <div className="cert-name">{cert.name}</div>
                    {cert.institution && <div className="cert-institution">🏫 {cert.institution}</div>}
                    {cert.description && <div className="cert-desc">{cert.description}</div>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      {cert.udemy_url && (
                        <a href={cert.udemy_url} target="_blank" rel="noopener noreferrer" className="cert-udemy">
                          🎓 Udemy →
                        </a>
                      )}
                      {cert.coursera_url && (
                        <a href={cert.coursera_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#0369a1", textDecoration: "none", fontWeight: 600 }}>
                          📚 Coursera →
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="ai-section">
            <h4>🔧 Skill Gaps to Address</h4>
            {roadmap.skill_gaps?.map((g, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "center",
                padding: "8px 12px", marginBottom: 6,
                background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8
              }}>
                <span>⚠️</span>
                <span style={{ fontSize: 13 }}>{g}</span>
              </div>
            ))}
          </div>

          {roadmap.timeline && (
            <div style={{
              background: "linear-gradient(135deg, #1a1a1a, #2d1810)", color: "#fff",
              borderRadius: 10, padding: 14, marginTop: 8, textAlign: "center"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>ESTIMATED TIMELINE</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>⏱️ {roadmap.timeline}</div>
            </div>
          )}

          {/* YouTube Channels */}
          {roadmap.youtube_channels?.length > 0 && (
            <div className="ai-section">
              <h4>🎬 YouTube Channels for Skill Upgrade</h4>
              <div className="yt-grid">
                {roadmap.youtube_channels.map((ch, i) => (
                  <a key={i} href={ch.url} target="_blank" rel="noopener noreferrer" className="yt-card">
                    <div className="yt-name">▶ {ch.name}</div>
                    <div className="yt-topic">{ch.topic}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Learning Platforms */}
          {roadmap.learning_resources?.length > 0 && (
            <div className="ai-section">
              <h4>📚 Learning Platforms & Courses</h4>
              <div className="learn-grid">
                {roadmap.learning_resources.map((lr, i) => (
                  <a key={i} href={lr.url} target="_blank" rel="noopener noreferrer" className="learn-card">
                    <div className="learn-platform">{lr.platform}</div>
                    <div className="learn-desc">{lr.description}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TRENDING JOBS ══════════ */}
      {!loading && trending && activeTab === "trending" && (
        <div className="ai-result">
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14, lineHeight: 1.6 }}>
            🔥 Based on your resume, here are the most in-demand roles in the market right now — with tech stacks, certifications, and top hiring companies.
          </p>
          {trending.jobs?.map((job, i) => (
            <TrendingJobCard key={i} job={job} />
          ))}
          {trending.market_insight && (
            <div style={{
              background: "linear-gradient(135deg,#1a1a1a,#2d1810)", color: "#fff",
              borderRadius: 10, padding: 14, marginTop: 8, fontSize: 13, lineHeight: 1.7
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>📈 Market Insight</div>
              {trending.market_insight}
            </div>
          )}
        </div>
      )}

      {/* ══════════ WRITEUP ══════════ */}
      {!loading && writeup && activeTab === "writeup" && (
        <div className="ai-result">
          <div className="ai-writeup">{writeup}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
            onClick={() => navigator.clipboard.writeText(writeup)}>Copy to clipboard</button>
        </div>
      )}

      {/* ══════════ REWRITE VARIANTS ══════════ */}
      {!loading && variants && activeTab === "rewrite" && (
        <div className="ai-result">
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
            Review each variant and click "Use this" to apply it.
          </p>
          {variants.map((v, i) => (
            <div key={i} className="ai-variant">
              <div className="ai-variant-head">
                <strong>{v.label}</strong>
                <button className="btn btn-primary btn-sm" onClick={() => onApplyVariant?.(v.content)}>Use this</button>
              </div>
              <p className="ai-variant-desc">{v.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Rich sub-components ── */

function ImprovementCard({ text, index }) {
  const ICONS   = ["📌", "⚡", "💡", "🔑", "📐", "🎨", "🔍", "📊"];
  const URGENCY = ["High Priority", "High Priority", "Medium Priority", "Medium Priority",
                   "Low Priority",  "Low Priority",  "High Priority",   "Medium Priority"];
  const URGENCY_COLORS = {
    "High Priority":   { bg: "#fef2f2", border: "#fecaca", badge: "#ef4444" },
    "Medium Priority": { bg: "#fff7ed", border: "#fed7aa", badge: "#f97316" },
    "Low Priority":    { bg: "#f0fdf4", border: "#bbf7d0", badge: "#22c55e" },
  };
  const urgency = URGENCY[index] || "Medium Priority";
  const colors  = URGENCY_COLORS[urgency];

  // Split into problem + what to do if possible
  const parts = text.split(/\.\s+(?=[A-Z])/);

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: 10, padding: 14, marginBottom: 10
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>{ICONS[index] || "📌"}</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Issue #{index + 1}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#fff", background: colors.badge,
          borderRadius: 20, padding: "2px 9px", flexShrink: 0
        }}>{urgency}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: "#1c1a17" }}>
        {parts[0]}{parts.length > 1 && "."}
      </p>
      {parts.length > 1 && (
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: "6px 0 0", color: "#57514a", fontStyle: "italic" }}>
          💬 {parts.slice(1).join(". ")}
        </p>
      )}
    </div>
  );
}

function RecommendationCard({ text, index }) {
  const IMPACT  = ["🚀 High Impact", "🚀 High Impact", "⚡ Quick Win", "⚡ Quick Win",
                   "📈 Long-term",   "📈 Long-term",   "🔑 Critical",  "💡 Strategic",
                   "⚡ Quick Win",   "📈 Long-term",   "🔑 Critical",  "💡 Strategic"];
  const IMPACT_COLORS = {
    "🚀 High Impact": "#b45309",
    "⚡ Quick Win":   "#0369a1",
    "📈 Long-term":   "#166534",
    "🔑 Critical":    "#dc2626",
    "💡 Strategic":   "#7c3d12",
  };
  const impact = IMPACT[index] || "💡 Strategic";
  const color  = IMPACT_COLORS[impact] || "#57514a";

  // Try to extract why it matters
  const whyMap = [
    "Recruiters spend only 6 seconds scanning a resume. Your first impression needs to count.",
    "ATS systems filter 75% of resumes before a human sees them. Keywords are your gatekeepers.",
    "Quantified achievements are 40% more persuasive than vague descriptions.",
    "LinkedIn is checked by 87% of recruiters before shortlisting a candidate.",
    "Certifications validate expertise and can increase salary offers by 10-20%.",
    "Projects demonstrate initiative and real-world capability beyond job duties.",
    "Action verbs signal leadership and ownership — not just task execution.",
    "A tailored resume is 3× more likely to get an interview than a generic one.",
    "Skills sections with 10+ technologies rank higher in ATS systems.",
    "A strong summary positions you before the recruiter reads anything else.",
    "Industry networking accounts for 70-80% of all job placements.",
    "Consistent personal branding across LinkedIn and resume builds recruiter trust.",
  ];

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2dccf",
      borderLeft: `3px solid ${color}`, borderRadius: 10,
      padding: 14, marginBottom: 10
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#1c1a17" }}>#{index + 1}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}15`, borderRadius: 20, padding: "2px 9px" }}>
          {impact}
        </span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 6px", fontWeight: 600 }}>{text}</p>
      <p style={{ fontSize: 12, color: "#57514a", lineHeight: 1.6, margin: 0, borderTop: "1px solid #f0ede8", paddingTop: 6 }}>
        💡 <em>{whyMap[index] || "Following this recommendation will significantly improve your interview chances."}</em>
      </p>
    </div>
  );
}

function RoadmapStep({ text, index }) {
  const TIMEFRAMES = [
    "Month 1-2",  "Month 2-4",  "Month 3-6",  "Month 4-8",
    "Month 6-9",  "Month 6-12", "Month 9-15", "Month 12-18",
    "Month 12-24","Month 18-24",
  ];
  const CATEGORIES = [
    { label: "Skills", color: "#0369a1" },
    { label: "Leadership", color: "#7c3d12" },
    { label: "Credentials", color: "#166534" },
    { label: "Portfolio", color: "#b45309" },
    { label: "Network", color: "#6d28d9" },
    { label: "Visibility", color: "#be185d" },
    { label: "Mentoring", color: "#0369a1" },
    { label: "Strategy", color: "#7c3d12" },
    { label: "Execution", color: "#166534" },
    { label: "Growth", color: "#b45309" },
  ];
  const cat = CATEGORIES[index % CATEGORIES.length];

  // Expanded explanations for common roadmap steps
  const expansions = {
    "Deepen expertise": "Pick 1-2 core technologies and go beyond tutorials. Contribute to open-source, build side projects, and read official docs + RFCs. Depth beats breadth at senior levels.",
    "cross-functional": "Volunteer for projects requiring coordination with Product, Design, or Data teams. Cross-functional experience is the #1 differentiator between senior ICs and leads.",
    "certifications": "Certifications add credibility and pass ATS filters. Focus on role-relevant certs (AWS for backend, GCP for ML, PMP for management). They also reflect structured learning discipline.",
    "portfolio": "Document your projects on GitHub with clear READMEs. Quantify results (50ms latency reduction, 3× faster builds). Recruiters spend 20% of their time on GitHub when evaluating senior candidates.",
    "Network": "70-80% of jobs are filled through referrals. Attend local meetups, contribute to Slack communities (CNCF, PyData), and connect with ex-colleagues. Referral candidates get 3× more interviews.",
    "Contribute": "Open-source contributions signal technical credibility and communication skills. Even documentation PRs matter. Pick projects used by your target companies.",
    "Present": "Speaking at meetups builds personal brand and forces clarity of thinking. One conference talk can generate 5-10 recruiter contacts. Start with internal tech talks or local user groups.",
  };

  let explanation = "A focused action that moves you measurably toward your next career milestone.";
  for (const [key, val] of Object.entries(expansions)) {
    if (text.toLowerCase().includes(key.toLowerCase())) { explanation = val; break; }
  }

  return (
    <div style={{
      display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start"
    }}>
      {/* Timeline marker */}
      <div style={{ flexShrink: 0, textAlign: "center", width: 56 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", background: cat.color,
          color: "#fff", fontWeight: 800, fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 3px"
        }}>{index + 1}</div>
        <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.2 }}>{TIMEFRAMES[index] || `Step ${index+1}`}</div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: "#fff", border: "1px solid #e2dccf",
        borderTop: `2px solid ${cat.color}`, borderRadius: 9, padding: "10px 14px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{text}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: cat.color,
            background: `${cat.color}15`, borderRadius: 20, padding: "2px 8px", flexShrink: 0, marginLeft: 6
          }}>{cat.label}</span>
        </div>
        <p style={{ fontSize: 12, color: "#57514a", lineHeight: 1.6, margin: 0 }}>{explanation}</p>
      </div>
    </div>
  );
}

function TrendingJobCard({ job }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2dccf", borderRadius: 12,
      marginBottom: 14, overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#2d1810,#1a1a1a)", color: "#fff",
        padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{job.title}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{job.category}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            background: "#d97706", borderRadius: 20, padding: "3px 10px",
            fontSize: 12, fontWeight: 700
          }}>{job.demand_level || "High Demand"}</div>
          {job.avg_salary && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>💰 {job.avg_salary}</div>
          )}
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 13, color: "#57514a", lineHeight: 1.7, margin: "0 0 12px" }}>{job.description}</p>

        {/* Tech Stack */}
        {job.tech_stack?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1c1a17", marginBottom: 6 }}>🛠️ Required Tech Stack</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {job.tech_stack.map((t, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px",
                  borderRadius: 20, background: "#f3f0e8", border: "1px solid #e2dccf", color: "#57514a"
                }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Match score */}
        {job.match_score !== undefined && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>Your Resume Match</span>
              <span style={{ fontWeight: 700, color: job.match_score >= 70 ? "#16a34a" : "#d97706" }}>
                {job.match_score}%
              </span>
            </div>
            <div style={{ height: 6, background: "#e2dccf", borderRadius: 3 }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${job.match_score}%`,
                background: job.match_score >= 70 ? "#16a34a" : "#d97706"
              }} />
            </div>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none", border: "none", color: "#b45309", fontWeight: 600,
            fontSize: 13, cursor: "pointer", padding: 0, marginBottom: expanded ? 10 : 0
          }}
        >
          {expanded ? "▲ Show less" : "▼ Show certifications & hiring companies"}
        </button>

        {expanded && (
          <div>
            {/* Certifications */}
            {job.certifications?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📜 Top Certifications</div>
                {job.certifications.map((cert, i) => (
                  <div key={i} style={{
                    background: "#fffdf8", border: "1px solid #e2dccf", borderRadius: 8,
                    padding: "8px 12px", marginBottom: 6, fontSize: 13
                  }}>
                    <div style={{ fontWeight: 600 }}>{cert.name}</div>
                    {cert.provider && <div style={{ fontSize: 12, color: "#57514a", marginTop: 2 }}>🏫 {cert.provider}</div>}
                    {cert.url && (
                      <a href={cert.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#b45309", textDecoration: "none", fontWeight: 600, display: "block", marginTop: 4 }}>
                        🎓 Get Certified →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Hiring companies */}
            {job.hiring_companies?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🏢 Top Hiring Companies</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {job.hiring_companies.map((co, i) => (
                    <a key={i}
                      href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.title)}&company=${encodeURIComponent(co.name || co)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "5px 12px",
                        borderRadius: 8, background: "#0077b5", color: "#fff",
                        textDecoration: "none", display: "flex", alignItems: "center", gap: 4
                      }}>
                      🔗 {co.name || co}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
