import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { ContactForm, FeedbackForm } from "../components/ContactForms.jsx";
import { SkeletonBlock, SkeletonLine } from "../components/Skeleton.jsx";
import Markdown from "../components/Markdown.jsx";

function CmsSkeleton() {
  return (
    <>
      <Topbar />
      <div className="container cms-container">
        <SkeletonBlock width={90} height={38} borderRadius={8} style={{ marginBottom: 20 }} />
        <SkeletonBlock width="55%" height={36} borderRadius={6} style={{ marginBottom: 10 }} />
        <SkeletonBlock width="35%" height={18} borderRadius={4} style={{ marginBottom: 28 }} />
        {/* Content paragraph skeletons */}
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonLine key={i} width={i % 3 === 0 ? "45%" : i % 2 === 0 ? "90%" : "100%"} height={18} style={{ marginBottom: 12 }} />
        ))}
        {/* Extra blocks for subscription-like pages */}
        <div style={{ marginTop: 32, padding: 28, background: "#fff", border: "1px solid #e2dccf", borderRadius: 12 }}>
          <SkeletonBlock width={140} height={18} borderRadius={4} style={{ marginBottom: 14 }} />
          <SkeletonBlock width={200} height={40} borderRadius={6} style={{ marginBottom: 10 }} />
          <SkeletonBlock width={220} height={18} borderRadius={4} style={{ marginBottom: 20 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonLine key={i} width="75%" height={16} style={{ marginBottom: 10 }} />
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}

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
        {loading && <CmsSkeleton />}
        {!loading && error && <div className="error">{error}</div>}
        {page && (
          <div className="cms-page">
            <h1 className="cms-title">{page.icon} {page.title.replace(/^[^\s]+\s/, "")}</h1>
            {slug === "subscription"
              ? renderPricingFromText(page.content, page.title)
              : <div className="cms-body"><Markdown>{page.content}</Markdown></div>
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
