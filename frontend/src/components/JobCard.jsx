export default function JobCard({ job }) {
  const {
    title,
    company,
    location,
    salary,
    workplaceType,
    isEasyApply,
    postedTimeAgo,
    url,
    companyLogo,
  } = job || {};

  return (
    <div className="job-card">
      <div className="job-card-header">
        {companyLogo ? (
          <img src={companyLogo} alt={company} className="job-logo" />
        ) : (
          <div className="job-logo fallback">🏢</div>
        )}
        <div className="job-header-text">
          <h3 className="job-title">{title || "Job Title"}</h3>
          <p className="job-company">{company || "Company"}</p>
        </div>
      </div>
      <div className="job-details">
        {location && location !== "Unknown Location" && <span className="job-tag">📍 {location}</span>}
        {workplaceType && workplaceType !== "unknown" && (
          <span className="job-tag">🏢 {workplaceType}</span>
        )}
        {salary && <span className="job-tag">💰 {salary}</span>}
        {postedTimeAgo && postedTimeAgo !== "Unknown" && <span className="job-tag">🕐 {postedTimeAgo}</span>}
        {isEasyApply && <span className="job-tag easy-apply">⚡ Easy Apply</span>}
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="job-apply-btn"
        >
          View on LinkedIn →
        </a>
      )}
      <style>{`
        .job-card {
          background: #fff;
          border: 1px solid #e2dccf;
          border-radius: 12px;
          padding: 16px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .job-card:hover { border-color: #d97706; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .job-card-header {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          align-items: flex-start;
        }
        .job-logo {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          object-fit: contain;
          background: #fff;
          border: 1px solid #e2dccf;
          padding: 2px;
        }
        .job-logo.fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: #f3f0e9;
        }
        .job-header-text { flex: 1; }
        .job-title { margin: 0; font-size: 16px; font-weight: 600; color: #1c1a17; line-height: 1.3; }
        .job-company { margin: 4px 0 0 0; font-size: 14px; color: #57514a; }
        .job-details {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .job-tag {
          font-size: 12px;
          padding: 4px 10px;
          background: #f3f0e9;
          border-radius: 12px;
          color: #57514a;
          font-weight: 500;
        }
        .job-tag.easy-apply {
          background: #ecfdf5;
          color: #059669;
        }
        .job-apply-btn {
          display: inline-block;
          padding: 8px 16px;
          background: #d97706;
          color: white;
          border-radius: 8px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
        }
        .job-apply-btn:hover { background: #b45309; }
      `}</style>
    </div>
  );
}