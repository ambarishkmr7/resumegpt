export default function AuthLayout({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <div className="brandmark">
          <img src="/logo.png" alt="resumesGPT" className="brand-logo" /> resumesGPT
        </div>
        <div>
          <h1>Free India's #1 AI Resume Builder — Get Hired Faster</h1>
          <p style={{ lineHeight: 1.75, marginBottom: 16 }}>
            Build an ATS-optimized resume in minutes. Our AI scores, rewrites,
            and tailors your resume to every job — so you spend less time applying
            and more time interviewing.
          </p>
          <ul style={{ lineHeight: 2.1 }}>
            <li>✅ <strong>Free ATS Score Checker</strong> — 100-point resume analysis</li>
            <li>✅ <strong>Free AI Resume Rewriting</strong> — 3 strategic variants</li>
            <li>✅ <strong>Free 30 Professional Templates</strong> — PDF &amp; DOCX</li>
            <li>✅ <strong>Free Cover Letter Generator</strong> — job-specific</li>
            <li>✅ <strong>Mock Interview Practice</strong> — AI scoring</li>
            <li>✅ <strong>Free Job Search Agent</strong> — LinkedIn, Naukri, Indeed</li>
            <li>✅ <strong>Free Career Roadmap</strong> — certifications &amp; courses</li>
          </ul>
        </div>

        <div style={{ marginTop: 20, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" }}>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6, opacity: 0.9 }}>
            🏆 Trusted by <strong>10,000+ professionals</strong> across India —
            freshers, mid-career switchers, and senior executives alike.
          </p>
        </div>

        <div style={{ opacity: 0.6, fontSize: 12, marginTop: 12 }}>
          Free forever · No credit card required · One-time Elite plan available
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}
