import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";

/* ── helpers ── */
function buildContentFromProfile(profile) {
  if (!profile) return null;
  return {
    contact: {
      name: profile.personal?.full_name || "",
      title: profile.personal?.headline || profile.preferences?.desired_role || "",
      email: profile.personal?.email || "",
      phone: profile.personal?.phone || "",
      location: profile.personal?.location || "",
      linkedin: profile.personal?.linkedin_url || "",
      website: "",
    },
    summary: profile.personal?.summary || "",
    skills: profile.skills || [],
    experience: (profile.experience || []).map((e) => ({
      title: e.title || "",
      company: e.company || "",
      location: "",
      start: e.start_date || "",
      end: e.current ? "Present" : (e.end_date || ""),
      bullets: e.description ? [e.description] : [],
    })),
    education: [], skill_ratings: [], core_competencies: [], certifications: [],
    languages: [], accomplishments: [], activities: [], projects: [],
    references: [], custom_sections: [], section_order: [], profile_photo: "",
  };
}

const SOURCE_COLORS = {
  LinkedIn:    { bg: "#0077b5", light: "#e8f4fb" },
  Naukri:      { bg: "#ff7555", light: "#fff0ec" },
  Indeed:      { bg: "#2557a7", light: "#eaf0fb" },
  Monster:     { bg: "#6600cc", light: "#f3e8ff" },
  Shine:       { bg: "#e25c00", light: "#fff3e8" },
  "Remote.com":{ bg: "#16a34a", light: "#dcfce7" },
  Crossover:   { bg: "#7c3aed", light: "#f3e8ff" },
  "Remote.co": { bg: "#0891b2", light: "#e0f2fe" },
};
const TYPE_COLORS = {
  "Remote":    { bg: "#059669", text: "#fff" },
  "Hybrid":    { bg: "#d97706", text: "#fff" },
  "Full-time": { bg: "#1c1a17", text: "#fff" },
  "Contract":  { bg: "#7c3aed", text: "#fff" },
};

function Badge({ label, style }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3, ...style,
    }}>{label}</span>
  );
}

function JobCard({ job }) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_COLORS[job.source] || { bg: "#57514a", light: "#f0ece4" };
  const typ = TYPE_COLORS[job.job_type] || { bg: "#57514a", text: "#fff" };
  const daysAgo = job.posted_days_ago === 1 ? "Today" :
    job.posted_days_ago <= 7 ? `${job.posted_days_ago}d ago` :
    `${Math.floor(job.posted_days_ago / 7)}w ago`;
  // Portal search cards show a search page, not a single job — detect by title suffix
  const isSearchCard = job.job_title.endsWith("— Live Search");

  return (
    <div className="job-card" style={isSearchCard ? { background: "#fffdf8", borderStyle: "dashed" } : {}}>
      {isSearchCard && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", marginBottom: 8, letterSpacing: 0.4 }}>
          🔍 JOB SEARCH PORTAL
        </div>
      )}
      {/* ── header row ── */}
      <div className="jc-header">
        {/* company logo placeholder */}
        <div className="jc-logo" style={{ background: src.light, color: src.bg }}>
          {job.company.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="jc-title">{job.job_title}</div>
          <div className="jc-company">{job.company} · {job.location}</div>
        </div>
        <div className="jc-meta-right">
          <span className="jc-source" style={{ background: src.bg }}>{job.source}</span>
          <span className="jc-days">{daysAgo}</span>
        </div>
      </div>

      {/* ── badges row ── */}
      <div className="jc-badges">
        <Badge label={job.job_type} style={{ background: typ.bg, color: typ.text }} />
        {job.experience_required && (
          <Badge label={job.experience_required} style={{ background: "#f3f0e9", color: "#57514a" }} />
        )}
        {job.salary_range && (
          <Badge label={job.salary_range} style={{ background: "#fef3c7", color: "#92400e" }} />
        )}
      </div>

      {/* ── skills ── */}
      {job.skills_required?.length > 0 && (
        <div className="jc-skills">
          {job.skills_required.slice(0, 6).map((s, i) => (
            <span key={i} className="jc-skill-chip">{s}</span>
          ))}
          {job.skills_required.length > 6 && (
            <span className="jc-skill-chip jc-skill-more">+{job.skills_required.length - 6}</span>
          )}
        </div>
      )}

      {/* ── description ── */}
      <p className="jc-desc" style={{ WebkitLineClamp: expanded ? "unset" : 2 }}>
        {job.description}
      </p>
      {job.description?.length > 120 && (
        <button className="jc-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less ▲" : "Read more ▼"}
        </button>
      )}

      {/* ── apply / search button ── */}
      <div className="jc-footer">
        <a
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          className="jc-apply-btn"
          style={{ background: src.bg }}
        >
          {isSearchCard ? `🔍 Search Jobs on ${job.source} →` : `Apply on ${job.source} →`}
        </a>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="job-card" style={{ pointerEvents: "none" }}>
      <div className="jc-header">
        <div className="jc-logo sk-box" style={{ background: "#e8e4db" }} />
        <div style={{ flex: 1 }}>
          <div className="sk-line" style={{ width: "55%", height: 18, marginBottom: 6 }} />
          <div className="sk-line" style={{ width: "35%", height: 13 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
        {[60, 80, 90].map((w, i) => <div key={i} className="sk-box" style={{ width: w, height: 22, borderRadius: 20 }} />)}
      </div>
      <div className="sk-line" style={{ width: "100%", height: 13, marginBottom: 4 }} />
      <div className="sk-line" style={{ width: "80%", height: 13, marginBottom: 16 }} />
      <div className="sk-box" style={{ width: 140, height: 36, borderRadius: 8 }} />
    </div>
  );
}

/* ── main page ── */
export default function JobsPage() {
  const navigate = useNavigate();

  const [profile, setProfile]     = useState(null);
  const [resumes, setResumes]     = useState([]);
  const [dataReady, setDataReady] = useState(false);

  const [targetRole, setTargetRole] = useState("");
  const [location,   setLocation]   = useState("");
  const [skillsText, setSkillsText] = useState(""); // comma-separated editable

  const [listings,    setListings]    = useState([]);
  const [globalUrls,  setGlobalUrls]  = useState({});
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [filterSource, setFilterSource] = useState("All");
  const [filterType,   setFilterType]   = useState("All");

  /* load profile + resumes once */
  useEffect(() => {
    Promise.allSettled([api.getProfile(), api.listResumes()]).then(([pRes, rRes]) => {
      const p = pRes.status === "fulfilled" ? pRes.value : null;
      const rs = rRes.status === "fulfilled" ? rRes.value : [];

      setProfile(p);
      setResumes(rs);

      // ── auto-fill title: prefer latest resume title, fallback to profile ──
      let title = "";
      if (rs.length > 0) {
        const latest = rs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
        title = latest.content?.contact?.title || "";
      }
      if (!title && p) title = p.preferences?.desired_role || p.personal?.headline || "";
      setTargetRole(title);

      // ── auto-fill location ──
      let loc = "";
      if (p) loc = (p.preferences?.preferred_locations || [])[0] || p.personal?.location || "";
      setLocation(loc);

      // ── auto-fill skills: merge resume skills + profile skills, dedupe ──
      const resumeSkills = rs.length > 0
        ? (rs[0].content?.skills || [])
        : [];
      const profileSkills = p?.skills || [];
      const merged = [...new Set([...resumeSkills, ...profileSkills])];
      setSkillsText(merged.slice(0, 20).join(", "));

      setDataReady(true);
    });
  }, []);

  const skillsArray = () =>
    skillsText.split(",").map((s) => s.trim()).filter(Boolean);

  const search = async () => {
    const role = targetRole.trim();
    if (!role) return;
    setLoading(true);
    setError("");
    setHasSearched(true);
    setListings([]);
    setFilterSource("All");
    setFilterType("All");

    const content = buildContentFromProfile(profile);
    const skills  = skillsArray();

    try {
      const result = await api.jobListings(content, role, location || null, skills);
      setListings(result.listings || []);
      setGlobalUrls({
        linkedin:  result.linkedin_job_url,
        naukri:    result.naukri_job_url,
        indeed:    result.indeed_job_url,
        monster:   result.monster_url,
        shine:     result.shine_url,
        remote:    result.remote_jobs_url,
        remoteCom: result.remote_com_url,
        crossover: result.crossover_url,
        remoteCo:  result.remote_co_url,
      });
    } catch (e) {
      setError(e.message || "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* filtered listings */
  const filtered = listings.filter((j) => {
    if (filterSource !== "All" && j.source !== filterSource) return false;
    if (filterType   !== "All" && j.job_type !== filterType)  return false;
    return true;
  });

  const sources  = ["All", ...new Set(listings.map((j) => j.source))];
  const jobTypes = ["All", ...new Set(listings.map((j) => j.job_type))];

  const PLATFORM_LINKS = [
    { label: "LinkedIn",      url: globalUrls.linkedin,  color: "#0077b5" },
    { label: "Naukri",        url: globalUrls.naukri,    color: "#ff7555" },
    { label: "Indeed",        url: globalUrls.indeed,    color: "#2557a7" },
    { label: "Monster",       url: globalUrls.monster,   color: "#6600cc" },
    { label: "Shine",         url: globalUrls.shine,     color: "#e25c00" },
    { label: "🌍 Remote Jobs",url: globalUrls.remote,    color: "#059669" },
    { label: "🌐 Remote.com", url: globalUrls.remoteCom, color: "#16a34a" },
    { label: "🔄 Crossover",  url: globalUrls.crossover, color: "#7c3aed" },
    { label: "🏠 Remote.co",  url: globalUrls.remoteCo,  color: "#0891b2" },
  ].filter((p) => p.url);

  return (
    <>
      <Topbar />

      <div className="jobs-page-wrap">

        {/* ── page header ── */}
        <div className="jobs-page-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
          <div>
            <h1>Find Jobs</h1>
            <p>AI-matched job listings from LinkedIn, Naukri, Indeed, Monster, Shine, Remote.com, Crossover &amp; Remote.co</p>
          </div>
        </div>

        {/* ── search card ── */}
        <div className="jobs-search-card">
          <div className="jobs-form-grid">
            <div className="field">
              <label>Job Title / Role
                {resumes.length > 0 && (
                  <span className="field-hint">pulled from your latest resume</span>
                )}
              </label>
              <input
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
            <div className="field">
              <label>Preferred Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bangalore, India or Remote"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>
              Skills
              <span className="field-hint">comma-separated — edit to refine matches</span>
            </label>
            <textarea
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="e.g. Python, React, PostgreSQL, AWS, Docker"
              rows={2}
              className="skills-textarea"
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={search}
              disabled={loading || !targetRole.trim()}
            >
              {loading ? "Searching…" : "🔍 Find Jobs"}
            </button>
            {!dataReady && (
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Loading your profile…</span>
            )}
            {dataReady && !profile?.skills?.length && !resumes.length && (
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                <span
                  onClick={() => navigate("/profile")}
                  style={{ color: "#d97706", cursor: "pointer", textDecoration: "underline" }}
                >Complete your profile</span> for better matches
              </span>
            )}
          </div>
        </div>

        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── skeleton ── */}
        {loading && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {[1,2,3,4,5,6].map(i => <div key={i} className="sk-box" style={{ width: 100, height: 34, borderRadius: 8 }} />)}
            </div>
            {[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── results ── */}
        {!loading && hasSearched && (
          <>
            {/* platform quick-links */}
            {PLATFORM_LINKS.length > 0 && (
              <div className="platform-links-bar">
                <span className="plb-label">Browse all on:</span>
                {PLATFORM_LINKS.map((p) => (
                  <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="plb-btn" style={{ "--plb-color": p.color }}>
                    {p.label}
                  </a>
                ))}
              </div>
            )}

            {/* filter bar */}
            {listings.length > 0 && (
              <div className="filter-bar">
                <div className="filter-group">
                  <span className="filter-label">Source:</span>
                  {sources.map(s => (
                    <button key={s}
                      className={`filter-chip ${filterSource === s ? "active" : ""}`}
                      onClick={() => setFilterSource(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <div className="filter-group">
                  <span className="filter-label">Type:</span>
                  {jobTypes.map(t => (
                    <button key={t}
                      className={`filter-chip ${filterType === t ? "active" : ""}`}
                      onClick={() => setFilterType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <span className="filter-count">
                  {filtered.length} of {listings.length} jobs
                </span>
              </div>
            )}

            {/* job cards */}
            {filtered.length === 0 && listings.length === 0 && (
              <div className="jobs-no-results">
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <p>No jobs found. Try a different role or location.</p>
              </div>
            )}
            {filtered.length === 0 && listings.length > 0 && (
              <div className="jobs-no-results">
                <p>No jobs match the selected filters.</p>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSource("All"); setFilterType("All"); }}>
                  Clear filters
                </button>
              </div>
            )}

            <div className="jobs-grid">
              {filtered.map((job, i) => <JobCard key={i} job={job} />)}
            </div>
          </>
        )}

        {/* ── empty state ── */}
        {!hasSearched && !loading && (
          <div className="jobs-empty-state">
            <div style={{ fontSize: 60, marginBottom: 16 }}>💼</div>
            <h2>Find Your Next Opportunity</h2>
            <p>
              Your role and skills are pre-filled from your resume and profile.
              Click <strong>Find Jobs</strong> to get AI-matched job postings across all platforms — including worldwide remote jobs on Remote.com, Crossover &amp; Remote.co.
            </p>
            <div className="platform-pills-row">
              {[
                { name: "LinkedIn",    color: "#0077b5" },
                { name: "Naukri",      color: "#ff7555" },
                { name: "Indeed",      color: "#2557a7" },
                { name: "Monster",     color: "#6600cc" },
                { name: "Shine",       color: "#e25c00" },
                { name: "🌍 Remote",   color: "#059669" },
                { name: "🌐 Remote.com",color: "#16a34a" },
                { name: "🔄 Crossover",color: "#7c3aed" },
                { name: "🏠 Remote.co",color: "#0891b2" },
              ].map(p => (
                <span key={p.name} className="platform-pill" style={{ borderColor: p.color, color: p.color }}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>

      <Footer />

      <style>{`
        .jobs-page-wrap {
          max-width: 900px;
          margin: 0 auto;
          padding: 28px 16px 60px;
        }
        .jobs-page-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 24px;
        }
        .jobs-page-header h1 {
          margin: 0;
          font-size: 26px;
          font-family: var(--display);
          color: var(--ink);
        }
        .jobs-page-header p {
          margin: 4px 0 0;
          font-size: 14px;
          color: var(--ink-soft);
        }

        /* ── search card ── */
        .jobs-search-card {
          background: var(--paper-2, #fff);
          border: 1px solid var(--line, #e2dccf);
          border-radius: 14px;
          padding: 22px 24px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .jobs-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .field-hint {
          font-size: 11px;
          font-weight: 400;
          color: var(--ink-soft);
          margin-left: 6px;
          background: #fef3c7;
          color: #92400e;
          padding: 1px 6px;
          border-radius: 10px;
        }
        .skills-textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line, #e2dccf);
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          color: var(--ink);
          resize: vertical;
          min-height: 56px;
          box-sizing: border-box;
          background: #fff;
          line-height: 1.5;
        }
        .skills-textarea:focus {
          outline: none;
          border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217,119,6,0.1);
        }

        /* ── platform links bar ── */
        .platform-links-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 18px;
          padding: 4px 2px 8px;
          background: transparent;
          border: none;
          border-radius: 0;
        }
        .plb-label {
          font-size: 13px; font-weight: 600; color: #57514a;
          margin-right: 2px; white-space: nowrap; flex: 0 0 auto;
        }
        .plb-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
          padding: 7px 16px;
          background: #fff;
          color: var(--plb-color, #0077b5);
          border: 1.5px solid var(--plb-color, #0077b5);
          border-radius: 999px;
          text-decoration: none;
          font-weight: 600;
          font-size: 13px;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s, transform 0.1s;
        }
        .plb-btn:hover {
          background: var(--plb-color, #0077b5);
          color: #fff;
          transform: translateY(-1px);
        }

        /* ── filter bar ── */
        .filter-bar {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
          padding: 10px 14px;
          background: #f8f5ef;
          border-radius: 10px;
          border: 1px solid #e2dccf;
        }
        .filter-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .filter-label { font-size: 12px; font-weight: 600; color: #57514a; }
        .filter-chip {
          padding: 4px 10px;
          border-radius: 16px;
          border: 1px solid #e2dccf;
          background: #fff;
          font-size: 12px;
          cursor: pointer;
          color: #57514a;
          font-weight: 500;
          transition: all 0.15s;
        }
        .filter-chip:hover { border-color: #d97706; color: #d97706; }
        .filter-chip.active { background: #d97706; color: #fff; border-color: #d97706; }
        .filter-count { margin-left: auto; font-size: 12px; color: #57514a; }

        /* ── jobs grid ── */
        .jobs-grid { display: flex; flex-direction: column; gap: 14px; }

        /* ── job card ── */
        .job-card {
          background: #fff;
          border: 1px solid #e2dccf;
          border-radius: 12px;
          padding: 20px;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .job-card:hover {
          box-shadow: 0 4px 20px rgba(0,0,0,0.09);
          border-color: #d4c9b8;
        }
        .jc-header {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 10px;
        }
        .jc-logo {
          width: 44px; height: 44px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 800;
          flex-shrink: 0;
          font-family: var(--display);
        }
        .jc-title {
          font-weight: 700;
          font-size: 16px;
          color: #1c1a17;
          line-height: 1.3;
        }
        .jc-company {
          font-size: 13px;
          color: #57514a;
          margin-top: 2px;
        }
        .jc-meta-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex-shrink: 0;
        }
        .jc-source {
          padding: 3px 8px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.3px;
        }
        .jc-days { font-size: 11px; color: #999; }

        .jc-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .jc-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 10px;
        }
        .jc-skill-chip {
          background: #f3f0e9;
          color: #57514a;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 12px;
          font-weight: 500;
        }
        .jc-skill-more { color: #999; background: transparent; }

        .jc-desc {
          font-size: 14px;
          color: #57514a;
          line-height: 1.65;
          margin: 0 0 4px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .jc-expand-btn {
          background: none; border: none;
          font-size: 12px; color: #d97706;
          cursor: pointer; padding: 2px 0 10px;
        }
        .jc-footer {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #f0ece4;
        }
        .jc-apply-btn {
          display: inline-block;
          padding: 9px 22px;
          color: #fff;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          transition: opacity 0.15s;
        }
        .jc-apply-btn:hover { opacity: 0.85; }

        /* ── empty / no-results ── */
        .jobs-empty-state {
          text-align: center;
          padding: 60px 20px 40px;
          color: var(--ink-soft, #57514a);
        }
        .jobs-empty-state h2 {
          font-size: 22px;
          margin-bottom: 10px;
          color: var(--ink, #1c1a17);
          font-family: var(--display);
        }
        .jobs-empty-state p {
          font-size: 15px;
          max-width: 480px;
          margin: 0 auto 24px;
          line-height: 1.7;
        }
        .platform-pills-row {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .platform-pill {
          padding: 6px 14px;
          border: 1.5px solid;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          background: #fff;
        }
        .jobs-no-results {
          text-align: center;
          padding: 40px 20px;
          color: var(--ink-soft);
        }

        /* ── skeleton ── */
        .sk-box {
          background: linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%);
          background-size: 200% 100%;
          animation: jsk 1.5s infinite;
          border-radius: 4px;
        }
        .sk-line {
          background: linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%);
          background-size: 200% 100%;
          animation: jsk 1.5s infinite;
          border-radius: 4px;
          display: block;
        }
        @keyframes jsk {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ── responsive ── */
        @media (max-width: 640px) {
          .jobs-form-grid { grid-template-columns: 1fr; }
          .jc-header { gap: 10px; }
          .jc-logo { width: 36px; height: 36px; font-size: 16px; }
          .jc-title { font-size: 15px; }
          .jc-meta-right { display: none; }
          .platform-links-bar { gap: 8px; }
          .plb-btn { padding: 6px 13px; font-size: 12px; }
          .filter-bar { flex-direction: column; align-items: flex-start; gap: 8px; }
          .filter-count { margin-left: 0; }
        }
      `}</style>
    </>
  );
}
