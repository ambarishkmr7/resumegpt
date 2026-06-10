import { useState } from "react";
import { api } from "../api/client";

export default function CareerPanel({ content }) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState(null);
  const [targetRole, setTargetRole] = useState("");
  const [location, setLocation] = useState(content?.contact?.location || "");
  const [error, setError] = useState("");

  const search = async () => {
    setLoading(true); setError("");
    try { setJobs(await api.jobs(content, targetRole || null, location || null)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const stars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.3;
    return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
  };

  return (
    <div className="panel career-panel">
      <h3>Career — Find Jobs</h3>
      <p className="panel-hint">
        Discover companies matching your skills with LinkedIn, Naukri, Indeed, and remote job links.
      </p>

      <div className="career-inputs">
        <div className="field">
          <label>Target role</label>
          <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
            placeholder={content?.contact?.title || "e.g. Senior Software Engineer"} />
        </div>
        <div className="field">
          <label>Preferred location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Bangalore, India" />
        </div>
        <button className="btn btn-primary" onClick={search} disabled={loading}
          style={{ width: "100%", marginTop: 4 }}>
          {loading ? "Searching…" : "🔍 Find matching companies"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {jobs && (
        <div className="career-results">
          {/* Global search links */}
          <div className="career-global-links">
            {jobs.linkedin_job_url && (
              <a href={jobs.linkedin_job_url} target="_blank" rel="noopener noreferrer" className="global-link gl-linkedin">
                LinkedIn Jobs
              </a>
            )}
            {jobs.naukri_job_url && (
              <a href={jobs.naukri_job_url} target="_blank" rel="noopener noreferrer" className="global-link gl-naukri">
                Naukri Jobs
              </a>
            )}
            {jobs.indeed_job_url && (
              <a href={jobs.indeed_job_url} target="_blank" rel="noopener noreferrer" className="global-link gl-indeed">
                Indeed Jobs
              </a>
            )}
            {jobs.remote_jobs_url && (
              <a href={jobs.remote_jobs_url} target="_blank" rel="noopener noreferrer" className="global-link gl-remote">
                🌍 Remote Jobs
              </a>
            )}
          </div>

          <h4 className="career-heading">
            Recommended Companies ({jobs.suggestions?.length || 0})
          </h4>

          {jobs.suggestions?.map((s, i) => (
            <div key={i} className="company-card">
              <div className="company-head">
                <strong>{s.company}</strong>
                {s.glassdoor_rating && (
                  <span className="gd-badge" title={`Glassdoor rating: ${s.glassdoor_rating}/5`}>
                    <span className="gd-stars">{stars(s.glassdoor_rating)}</span>
                    <span className="gd-num">{s.glassdoor_rating}</span>
                  </span>
                )}
              </div>
              <div className="company-role">{s.role}</div>
              <p className="company-reason">{s.match_reason}</p>
              {s.glassdoor_url && (
                <a href={s.glassdoor_url} target="_blank" rel="noopener noreferrer" className="gd-link">
                  Glassdoor Reviews →
                </a>
              )}
              <div className="company-links">
                {s.linkedin_search_url && (
                  <a href={s.linkedin_search_url} target="_blank" rel="noopener noreferrer" className="job-link linkedin">
                    LinkedIn
                  </a>
                )}
                {s.naukri_search_url && (
                  <a href={s.naukri_search_url} target="_blank" rel="noopener noreferrer" className="job-link naukri">
                    Naukri
                  </a>
                )}
                {s.indeed_search_url && (
                  <a href={s.indeed_search_url} target="_blank" rel="noopener noreferrer" className="job-link indeed">
                    Indeed
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
