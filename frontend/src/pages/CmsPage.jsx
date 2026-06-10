import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { ContactForm, FeedbackForm } from "../components/ContactForms.jsx";

export default function CmsPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api.getCmsPage(slug)
      .then(setPage)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Convert plain-text CMS markdown to React elements
  const renderContent = (text) => {
    if (!text) return null;

    // If content looks like it contains HTML tags, render it directly
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return (
        <div
          className="cms-html-body"
          dangerouslySetInnerHTML={{ __html: text }}
        />
      );
    }

    return text.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <h3 key={i} className="cms-h3">{line.replace(/\*\*/g, "")}</h3>;
      }
      if (line.startsWith("**")) {
        const parts = line.split("**").filter(Boolean);
        return (
          <p key={i}>
            {parts.map((p, j) => j % 2 === 0 ? <strong key={j}>{p}</strong> : p)}
          </p>
        );
      }
      if (line.startsWith("• ") || line.startsWith("- ")) {
        return <li key={i} className="cms-li">{line.slice(2)}</li>;
      }
      if (line.startsWith("Q:") || line.startsWith("**Q:")) {
        return <p key={i} className="cms-q">{line.replace(/\*\*/g, "")}</p>;
      }
      if (line.startsWith("A:") || line.startsWith("**A:")) {
        return <p key={i} className="cms-a">{line.replace(/\*\*/g, "")}</p>;
      }
      if (!line.trim()) return <br key={i} />;
      return <p key={i}>{line}</p>;
    });
  };

  // Convert plain-text subscription content into a styled pricing card
  const renderPricingFromText = (rawText, pageTitle) => {
    if (!rawText) return null;

    // Strip any HTML/JSX tags that may have been saved via admin editor
    const text = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Extract all bullet feature lines
    const features = text
      .split(/\n|(?<=\.) (?=[•\-])/)
      .flatMap(l => l.split("•"))
      .map(l => l.replace(/^[\-\s]+/, "").replace(/\*\*/g, "").trim())
      .filter(l => l.length > 2 && !l.match(/^Elite Plan|₹|One.time|Lifetime|recurring/i));

    // Extract price — look for ₹ followed by digits in the raw text
    const priceMatch = rawText.match(/₹\s*([\d,]+)/);
    const price = priceMatch ? priceMatch[1] : "1,999";

    // Title comes from DB page.title field, strip leading emoji
    const title = (pageTitle || "Elite Plan").replace(/^[\p{Emoji}\s]+/u, "").trim();

    return (
      <div className="pricing-card-db">
        <div className="pricing-card-header">
          <div className="pricing-badge">✨ LIFETIME ACCESS</div>
          <h2 className="pricing-title">{title}</h2>
          <div className="pricing-amount">
            <span className="pricing-currency">₹</span>
            <span className="pricing-number">{price}</span>
          </div>
          <p className="pricing-period">One-time payment · Lifetime access · No recurring fees</p>
        </div>
        {features.length > 0 && (
          <ul className="pricing-features-list">
            {features.map((f, i) => (
              <li key={i}><span className="pricing-check">✓</span>{f}</li>
            ))}
          </ul>
        )}
        <div className="pricing-cta-note">
          Subscribe from the <a href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>Dashboard → Choose Your Plan</a>
        </div>
      </div>
    );
  };

  return (
    <>
      <Topbar />
      <div className="container cms-container">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>← Back</Link>
        {loading && <p>Loading…</p>}
        {error && <div className="error">{error}</div>}
        {page && (
          <div className="cms-page">
            <h1 className="cms-title">{page.icon} {page.title.replace(/^[^\s]+\s/, "")}</h1>
            {slug === "subscription"
              ? renderPricingFromText(page.content, page.title)
              : <div className="cms-body">{renderContent(page.content)}</div>
            }

            {/* Contact form */}
            {slug === "contact-us" && (
              <div style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Send Us a Message</h2>
                <p style={{ color: "#57514a", fontSize: 14, marginBottom: 0 }}>
                  Fill in the form below and we'll respond within 24 hours.
                </p>
                <ContactForm />
              </div>
            )}

            {/* Feedback form */}
            {slug === "feedback" && (
              <div style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Share Your Feedback</h2>
                <p style={{ color: "#57514a", fontSize: 14, marginBottom: 0 }}>
                  Your feedback helps us make ResumeGPT better for everyone.
                </p>
                <FeedbackForm />
              </div>
            )}

            {page.updated_at && (
              <p className="cms-updated">Last updated: {new Date(page.updated_at).toLocaleDateString()}</p>
            )}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
