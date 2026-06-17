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
          <img src="/logo.png" alt="ResumeGPT" className="footer-logo" />
          <span>ResumeGPT</span>
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
          <h4 className="footer-col-heading">Sitemap</h4>
          <a href="/sitemap.html" className="footer-link">HTML Sitemap</a>
          <a href="/sitemap.xml" className="footer-link">XML Sitemap</a>
          <a href="/robots.txt" className="footer-link">robots.txt</a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>
          Powered by <a href="https://decalabs.in/" target="_blank" rel="noopener noreferrer"
            style={{ color: "#f59e0b", textDecoration: "none", fontWeight: 600 }}>DecaLabs</a>
          {" · "}© {new Date().getFullYear()}{" "}
          <a href="https://resumegpt.co.in" target="_blank" rel="noopener noreferrer"
            style={{ color: "#f59e0b", textDecoration: "none" }}>ResumeGPT.co.in</a>
          . All rights reserved.
        </span>
      </div>
    </footer>
  );
}
