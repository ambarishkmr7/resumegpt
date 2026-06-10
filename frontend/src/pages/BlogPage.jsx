import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";

const POSTS = [
  {
    slug: "how-to-beat-ats-systems-2026",
    tag: "ATS Tips",
    title: "How to Beat ATS Systems in 2026: The Complete Guide",
    excerpt:
      "Over 98% of Fortune 500 companies use Applicant Tracking Systems to filter resumes before a human ever reads them. Learn exactly how ATS parsers work and what to do to pass every filter.",
    date: "May 28, 2026",
    readTime: "8 min",
  },
  {
    slug: "resume-keywords-that-get-interviews",
    tag: "Resume Writing",
    title: "50 Power Keywords That Get Resumes Noticed by Recruiters",
    excerpt:
      "Action verbs and quantified achievements are the two biggest factors in resume impact. We analyzed 10,000 successful resumes to find the words that consistently land interviews.",
    date: "May 20, 2026",
    readTime: "6 min",
  },
  {
    slug: "ai-resume-builder-vs-traditional",
    tag: "Career Advice",
    title: "AI Resume Builder vs Traditional Resume Writing: Which Wins in 2026?",
    excerpt:
      "AI-powered resume tools have matured dramatically. We compare AI builders against professional resume writers across cost, quality, speed, and ATS compatibility.",
    date: "May 15, 2026",
    readTime: "10 min",
  },
  {
    slug: "freshers-resume-guide-india",
    tag: "Freshers",
    title: "The Definitive Fresher Resume Guide for Indian Job Market 2026",
    excerpt:
      "No work experience? No problem. This guide covers exactly what to put on your first resume, which sections matter most for Indian recruiters, and how to get shortlisted even without experience.",
    date: "May 10, 2026",
    readTime: "12 min",
  },
  {
    slug: "salary-negotiation-india-2026",
    tag: "Career Growth",
    title: "Salary Negotiation in India: How to Ask for 30–50% More and Get It",
    excerpt:
      "Most professionals leave ₹5–15 lakhs on the table each year by not negotiating. Learn the exact scripts, timing, and tactics that work with Indian employers in 2026.",
    date: "May 5, 2026",
    readTime: "9 min",
  },
  {
    slug: "cover-letter-templates-india",
    tag: "Cover Letters",
    title: "7 Cover Letter Templates That Actually Work for Indian Job Applications",
    excerpt:
      "A great cover letter can double your interview rate. Here are 7 templates tailored to common Indian job scenarios — IT, banking, consulting, startups, and more — with real examples.",
    date: "April 28, 2026",
    readTime: "7 min",
  },
];

const TAG_COLORS = {
  "ATS Tips": "#d97706",
  "Resume Writing": "#0369a1",
  "Career Advice": "#7c3d12",
  "Freshers": "#166534",
  "Career Growth": "#6d28d9",
  "Cover Letters": "#be185d",
};

export default function BlogPage() {
  return (
    <>
      <Topbar />

      {/* ── Hero ── */}
      <section style={{ background: "linear-gradient(135deg,#1a1a1a,#2d1810)", color: "#fff", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#f59e0b", textTransform: "uppercase", marginBottom: 12 }}>
            ResumeGPT Blog
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
      <div style={{ background: "#fffdf8", borderBottom: "1px solid #e2dccf", padding: "20px 24px", textAlign: "center" }}>
        <p style={{ maxWidth: 720, margin: "0 auto", fontSize: 14, color: "#57514a", lineHeight: 1.7 }}>
          Whether you're a fresher writing your first resume, a mid-career professional looking to switch industries,
          or a senior executive targeting leadership roles — our guides cover every career stage.
          Topics include <strong>ATS optimization</strong>, <strong>resume formatting</strong>,
          <strong> cover letters</strong>, <strong>salary negotiation</strong>, <strong>mock interviews</strong>,
          and <strong>AI-powered job search strategies</strong>.
        </p>
      </div>

      {/* ── Blog Grid ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Latest Articles</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 24 }}>
          {POSTS.map((post) => (
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
              <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>{post.title}</h3>
              <p style={{ fontSize: 14, color: "#57514a", lineHeight: 1.6, margin: 0, flex: 1 }}>{post.excerpt}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{post.date}</span>
                <Link to={`/page/blog`} style={{
                  fontSize: 13, fontWeight: 600, color: "#b45309", textDecoration: "none"
                }}>Read more →</Link>
              </div>
            </article>
          ))}
        </div>

        {/* ── SEO CTA ── */}
        <div style={{
          marginTop: 48, background: "linear-gradient(135deg,#2d1810,#1a1a1a)", borderRadius: 16,
          padding: "36px 32px", color: "#fff", textAlign: "center"
        }}>
          <h2 style={{ fontSize: 24, margin: "0 0 10px" }}>Ready to Build Your ATS-Optimized Resume?</h2>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 20 }}>
            Join thousands of Indian professionals who've landed interviews at top companies using ResumeGPT.
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
    </>
  );
}
