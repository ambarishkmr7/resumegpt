import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../components/Seo.jsx";
import { USER_GUIDE } from "../data/userGuide.js";

function StepBadge({ n }) {
  return (
    <span
      style={{
        flex: "0 0 26px",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "#d97706",
        color: "#fff",
        fontWeight: 800,
        fontSize: 13,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
      }}
    >
      {n}
    </span>
  );
}

export default function UserGuidePage() {
  const g = USER_GUIDE;

  return (
    <>
      <Topbar />
      <Seo
        title="User Guide — How to Use resumes-gpt"
        description="Step-by-step guide to resumes-gpt: create an account, pick a template, edit your resume, check your ATS score, use the AI writing tools, and the Elite toolkit."
      />

      <style>{`
        .ug-wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px; }
        .ug-grid { display: grid; grid-template-columns: 230px 1fr; gap: 40px; align-items: start; }
        .ug-toc { position: sticky; top: 88px; }
        .ug-shot { width: 100%; height: auto; display: block; border: 1px solid #e2dccf;
                   border-radius: 14px; box-shadow: 0 10px 30px rgba(60,40,10,.08); background:#fff; }
        @media (max-width: 820px) {
          .ug-grid { grid-template-columns: 1fr; gap: 20px; }
          .ug-toc { position: static; }
        }
      `}</style>

      <div className="ug-wrap">
        <Link to="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 18 }}>← Back to home</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>User Guide</h1>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 16px" }}>Last updated: {g.updated}</p>
        <p style={{ fontSize: 15.5, color: "#3f3a34", lineHeight: 1.75, margin: "0 0 8px", maxWidth: 760 }}>
          {g.intro}
        </p>
        <p style={{ fontSize: 12.5, color: "#9ca3af", margin: "0 0 28px" }}>
          The numbered <span style={{ color: "#d97706", fontWeight: 700 }}>amber markers</span> in each
          screenshot match the numbered steps beside it.
        </p>

        <div className="ug-grid">
          {/* Table of contents */}
          <nav className="ug-toc" aria-label="Guide contents">
            <div style={{
              border: "1px solid #e2dccf", borderRadius: 12, background: "#faf6ee", padding: "14px 14px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                On this page
              </div>
              {g.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="footer-link"
                  style={{ display: "block", fontSize: 13.5, color: "#3f3a34", padding: "6px 0", textDecoration: "none" }}
                >
                  <span style={{ marginRight: 6 }}>{s.icon}</span>
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          {/* Sections */}
          <div>
            {g.sections.map((s) => (
              <section key={s.id} id={s.id} style={{ marginBottom: 44, scrollMarginTop: 88 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
                  <span style={{ marginRight: 8 }}>{s.icon}</span>{s.title}
                </h2>
                <p style={{ fontSize: 14.5, color: "#57514a", lineHeight: 1.7, margin: "0 0 16px" }}>{s.intro}</p>

                <img className="ug-shot" src={s.image} alt={s.imageAlt} loading="lazy" width="880" height="560" />

                <ol style={{ listStyle: "none", padding: 0, margin: "18px 0 0" }}>
                  {s.steps.map((st, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                      <StepBadge n={i + 1} />
                      <span style={{ fontSize: 14.5, color: "#3f3a34", lineHeight: 1.6 }}>{st}</span>
                    </li>
                  ))}
                </ol>

                {s.tip && (
                  <div style={{
                    marginTop: 14, padding: "12px 14px", background: "#fff8ec",
                    border: "1px solid #f3d9a8", borderRadius: 10, fontSize: 13.5, color: "#7a5b1e", lineHeight: 1.6,
                  }}>
                    💡 <strong>Tip:</strong> {s.tip}
                  </div>
                )}
              </section>
            ))}

            <p style={{ fontSize: 14.5, color: "#57514a", lineHeight: 1.75, borderTop: "1px solid #eee5d6", paddingTop: 20 }}>
              {g.closing}
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <Link to="/register" className="btn btn-primary btn-sm">Create a free account</Link>
              <Link to="/page/faq" className="btn btn-ghost btn-sm">Read the FAQ</Link>
              <Link to="/page/contact-us" className="btn btn-ghost btn-sm">Contact support</Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
