import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../components/Seo.jsx";
import { BLOG_POSTS, BLOG_CATEGORIES } from "../data/blogPosts.js";

const POSTS = BLOG_POSTS;

const TAG_COLORS = {
  "Resume Basics": "#0369a1",
  "ATS": "#d97706",
  "Job-Specific": "#166534",
  "Career Growth": "#6d28d9",
  "AI & Hiring": "#be185d",
};

export default function BlogPage() {
  return (
    <>
      <Topbar />
      <Seo
        title="Resume & Career Blog — Tips, ATS Guides & Examples | resumes-gpt"
        description="Expert resume writing tips, ATS guides, job-specific resume examples, and AI hiring insights — updated for 2026."
      />

      {/* ── Hero ── */}
      <section className="blog-hero" style={{ background: "linear-gradient(135deg,#1a1a1a,#2d1810)", color: "#fff", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#f59e0b", textTransform: "uppercase", marginBottom: 12 }}>
            resumesGPT Blog
          </p>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 14px", lineHeight: 1.25 }}>
            Career Advice, Resume Tips &amp; Job Search Guides for India 2026
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 16, lineHeight: 1.7, margin: 0 }}>
            Expert-written guides to help you write a winning resume, ace interviews,
            and land your dream job — updated weekly for the Indian job market.
          </p>
        </div>
      </section>

      {/* ── SEO intro paragraph ── */}
      <div className="blog-seo-intro" style={{ background: "#fffdf8", borderBottom: "1px solid #e2dccf", padding: "20px 24px", textAlign: "center" }}>
        <p style={{ maxWidth: 720, margin: "0 auto", fontSize: 14, color: "#57514a", lineHeight: 1.7 }}>
          Whether you're a fresher writing your first resume, a mid-career professional looking to switch industries,
          or a senior executive targeting leadership roles — our guides cover every career stage.
          Topics include <strong>ATS optimization</strong>, <strong>resume formatting</strong>,
          <strong> cover letters</strong>, <strong>salary negotiation</strong>, <strong>mock interviews</strong>,
          and <strong>AI-powered job search strategies</strong>.
        </p>
      </div>

      {/* ── Blog Grid ── */}
      <div className="blog-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {BLOG_CATEGORIES.map((cat) => {
          const items = POSTS.filter((p) => p.tag === cat);
          if (!items.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{cat}</h2>
              <div className="blog-grid-inner" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 24 }}>
                {items.map((post) => (
                  <article key={post.slug} style={{
                    background: "#fff", border: "1px solid #e2dccf", borderRadius: 14,
                    padding: 24, display: "flex", flexDirection: "column", gap: 10
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
                        background: TAG_COLORS[post.tag] || "#7c3a1e", color: "#fff", letterSpacing: 0.5
                      }}>{post.tag}</span>
                      <span style={{ fontSize: 12, color: "#57514a" }}>{post.readTime} read</span>
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
                      <Link to={`/blog/${post.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{post.title}</Link>
                    </h3>
                    <p style={{ fontSize: 14, color: "#57514a", lineHeight: 1.6, margin: 0, flex: 1 }}>{post.excerpt}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>{post.date}</span>
                      <Link to={`/blog/${post.slug}`} style={{
                        fontSize: 13, fontWeight: 600, color: "#b45309", textDecoration: "none"
                      }}>Read more →</Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}

        {/* ── SEO CTA ── */}
        <div className="blog-cta" style={{
          marginTop: 48, background: "linear-gradient(135deg,#2d1810,#1a1a1a)", borderRadius: 16,
          padding: "36px 32px", color: "#fff", textAlign: "center"
        }}>
          <h2 style={{ fontSize: 24, margin: "0 0 10px" }}>Ready to Build Your ATS-Optimized Resume?</h2>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 20 }}>
            Join thousands of Indian professionals who've landed interviews at top companies using resumesGPT.
          </p>
          <Link to="/register" style={{
            display: "inline-block", background: "#d97706", color: "#fff",
            padding: "13px 28px", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: 15
          }}>
            Get Started Free →
          </Link>
        </div>
      </div>

      <Footer />

      <style>{`
        @media (max-width: 640px) {
          .blog-hero { padding: 28px 14px !important; }
          .blog-hero h1 { font-size: 22px !important; }
          .blog-hero p { font-size: 14px !important; }
          .blog-seo-intro { padding: 14px !important; }
          .blog-seo-intro p { font-size: 13px !important; }
          .blog-grid { padding: 20px 12px !important; }
          .blog-grid-inner { grid-template-columns: 1fr !important; gap: 14px !important; }
          .blog-cta { padding: 24px 16px !important; }
          .blog-cta h2 { font-size: 20px !important; }
        }
        @media (min-width: 641px) and (max-width: 768px) {
          .blog-hero { padding: 36px 20px !important; }
          .blog-hero h1 { font-size: 28px !important; }
          .blog-grid-inner { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </>
  );
}
