import { Link } from "react-router-dom";

const COLS = [
  {
    heading: "Platform",
    links: [
      { slug: "about-us", label: "About Us" },
      { slug: "blog", label: "Blog" },
      { slug: "whats-new", label: "What's New" },
      { slug: "faq", label: "FAQ" },
    ],
  },
  {
    heading: "Support",
    links: [
      { slug: "contact-us", label: "Contact Us" },
      { slug: "feedback", label: "Feedback" },
      { slug: "subscription", label: "Pricing" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { slug: "privacy-policy", label: "Privacy Policy" },
      { slug: "terms-of-service", label: "Terms of Service" },
      { slug: "refund-policy", label: "Refund Policy" },
      { slug: "disclaimer", label: "Disclaimer" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/logo.png" alt="resumesGPT" className="footer-logo" />
          <span>resumesGPT</span>
          <p className="footer-tagline">AI-Powered Career Builder</p>
          <p className="footer-tagline" style={{ marginTop: 6, fontSize: 12 }}>
            India's smartest resume tool — ATS scoring,<br />
            AI rewrites, mock interviews &amp; job search.
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.heading} className="footer-col">
            <h4 className="footer-col-heading">{col.heading}</h4>
            {col.links.map((l) => (
              <Link key={l.slug} to={`/page/${l.slug}`} className="footer-link">
                {l.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="footer-col">
          <h4 className="footer-col-heading">Resources</h4>
          <Link to="/user-guide" className="footer-link">User Guide</Link>
          <Link to="/resources/editorial-team" className="footer-link">Editorial Team</Link>
          <Link to="/resources/editorial-policy" className="footer-link">Editorial Policy</Link>
          <Link to="/resources/sources-and-references" className="footer-link">Sources &amp; References</Link>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-heading">Sitemap</h4>
          <a href="/sitemap.html" className="footer-link">HTML Sitemap</a>
        </div>
      </div>

      <div className="footer-social">
        <a href="https://www.linkedin.com/company/resumes-gpt" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="footer-social-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>
        </a>
        <a href="https://twitter.com/resumesgpt" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="footer-social-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z"/></svg>
        </a>
        <a href="https://www.instagram.com/resumesgpt" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="footer-social-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.94c-3.14 0-3.51.01-4.75.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.04.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.04-.9-.19-1.39-.32-1.71-.17-.43-.37-.74-.69-1.06-.32-.32-.63-.52-1.06-.69-.32-.13-.81-.28-1.71-.32-1.24-.06-1.61-.07-4.75-.07zm0 3.3a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2zm0 7.59a2.99 2.99 0 1 0 0-5.98 2.99 2.99 0 0 0 0 5.98zm5.86-7.81a1.08 1.08 0 1 1-2.15 0 1.08 1.08 0 0 1 2.15 0z"/></svg>
        </a>
        <a href="https://www.facebook.com/resumesgpt" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="footer-social-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z"/></svg>
        </a>
        <a href="https://www.youtube.com/@resumesgpt" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="footer-social-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.2C0 8.08 0 12 0 12s0 3.92.5 5.8a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.8zM9.6 15.57V8.43L15.82 12 9.6 15.57z"/></svg>
        </a>
      </div>

      <div className="footer-bottom">
        <span>
          Powered by <a href="https://kronossolution.com/" target="_blank" rel="noopener noreferrer"
            style={{ color: "#f59e0b", textDecoration: "none", fontWeight: 600 }}>KronosSolution</a>
          {" · "}© {new Date().getFullYear()}{" "}
          <a href="https://resumes-gpt.com" target="_blank" rel="noopener noreferrer"
            style={{ color: "#f59e0b", textDecoration: "none" }}>resumes-gpt.com</a>
          . All rights reserved.
        </span>
      </div>
    </footer>
  );
}
