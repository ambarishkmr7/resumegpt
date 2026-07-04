import { useParams, Navigate, Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../components/Seo.jsx";
import { getPost } from "../data/blogPosts.js";
import { SITE } from "../seo/seoConfig.js";

const TAG_COLORS = {
  "Resume Basics": "#0369a1",
  "ATS": "#d97706",
  "Job-Specific": "#166534",
  "Career Growth": "#6d28d9",
  "AI & Hiring": "#be185d",
};

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = getPost(slug);
  if (!post) return <Navigate to="/page/blog" replace />;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: SITE.url + "/logo.png" } },
    mainEntityOfPage: `${SITE.url}/blog/${post.slug}`,
    keywords: post.keyword,
  };

  return (
    <>
      <Topbar />
      <Seo title={`${post.title} | resumes-gpt Blog`} description={post.excerpt} jsonLd={[articleLd]} />

      <article style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 56px" }}>
        <Link to="/page/blog" className="btn btn-ghost btn-sm" style={{ marginBottom: 18 }}>← Back to Blog</Link>

        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
          background: TAG_COLORS[post.tag] || "#7c3a1e", color: "#fff", letterSpacing: 0.5, marginBottom: 12,
        }}>{post.tag}</span>

        <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.25, margin: "0 0 10px" }}>{post.title}</h1>
        <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 8px" }}>
          {post.date} · {post.readTime} read · Reviewed by the resumes-gpt Editorial Team
        </p>
        <p style={{ fontSize: 16.5, color: "#3f3a34", lineHeight: 1.7, fontStyle: "italic", margin: "0 0 28px" }}>{post.excerpt}</p>

        {post.content.map((sec, i) => (
          <section key={i} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 10px" }}>{sec.h2}</h2>
            {sec.p.map((para, k) => (
              <p key={k} style={{ fontSize: 15.5, color: "#3f3a34", lineHeight: 1.8, margin: "0 0 12px" }}>{para}</p>
            ))}
          </section>
        ))}

        {post.takeaways && (
          <div style={{ background: "#faf6ee", border: "1px solid #e2dccf", borderRadius: 12, padding: "18px 22px", margin: "28px 0" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>Key takeaways</h3>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14.5, color: "#3f3a34" }}>
              {post.takeaways.map((t, k) => <li key={k}>{t}</li>)}
            </ul>
          </div>
        )}

        {post.template && (
          <p style={{ fontSize: 15, margin: "20px 0" }}>
            👉 <Link to={`/resume-template/${post.template}`} style={{ color: "#b45309", fontWeight: 600 }}>
              See the matching free resume template →
            </Link>
          </p>
        )}

        {/* CTA */}
        <div style={{ marginTop: 36, background: "linear-gradient(135deg,#2d1810,#1a1a1a)", borderRadius: 16, padding: "32px 28px", color: "#fff", textAlign: "center" }}>
          <h2 style={{ fontSize: 22, margin: "0 0 10px" }}>Build your ATS-optimized resume free</h2>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 18 }}>
            Put this advice into practice in minutes with resumes-gpt.
          </p>
          <Link to="/register" style={{ display: "inline-block", background: "#d97706", color: "#fff", padding: "12px 26px", borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>
            Get Started Free →
          </Link>
        </div>
      </article>

      <Footer />
    </>
  );
}
