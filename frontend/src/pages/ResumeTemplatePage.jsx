import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client.js";
import { getTemplate, buildResumeContent, buildCoverLetter } from "../data/resumeTemplates.js";

export default function ResumeTemplatePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loginWithToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tpl = getTemplate(slug);
  if (!tpl) {
    return (
      <>
        <Topbar />
        <div className="container" style={{ padding: "60px 20px", textAlign: "center" }}>
          <h1>Template not found</h1>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>← Back to home</Link>
        </div>
        <Footer />
      </>
    );
  }

  const content = buildResumeContent(slug);
  const coverLetter = buildCoverLetter(slug);

  const pickResume = async () => {
    setError("");
    const title = `${content.contact.name} - ${tpl.role}`;
    setBusy(true);
    try {
      // Mirror the home page's flow: create a lightweight guest account if the
      // visitor isn't signed in, so picking a template "just works".
      if (!user) {
        const guest = await api.guestRegister();
        loginWithToken(guest);
      }
      await api.createResume({ title, template_id: "modern", content });
      // Land on the home page, in the My Resumes section.
      navigate("/?picked=1#my-resumes");
    } catch (e) {
      const msg = e?.message || "Could not add this resume.";
      // Friendlier message for the 4-resume cap (HTTP 409).
      setError(/up to 4 resumes/i.test(msg) ? msg : msg);
    } finally {
      setBusy(false);
    }
  };

  const c = content.contact;

  return (
    <>
      <Seo
        title={`${tpl.label} Example & Template (Free) — resumes-gpt`}
        description={`Free ${tpl.role} resume example with a professional objective, work experience, skills, and a matching cover letter. Pick it and customize in minutes.`}
      />
      <Topbar />

      <div className="container" style={{ maxWidth: 920, padding: "24px 16px 60px" }}>
        {/* Action bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">← Back</button>
          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/" className="btn btn-ghost btn-sm">Home</Link>
            <button onClick={pickResume} disabled={busy} className="btn btn-primary">
              {busy ? "Adding…" : "✓ Pick this resume"}
            </button>
          </div>
        </div>

        <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>{tpl.label}</h1>
        <p style={{ color: "#57514a", marginTop: 0 }}>
          A professional, ATS-friendly {tpl.role} resume sample with a matching cover letter.
          Click <strong>Pick this resume</strong> to customize it with your details.
        </p>
        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* Resume preview */}
        <div style={sheet}>
          <header style={{ borderBottom: "3px solid #b45309", paddingBottom: 14, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 26, letterSpacing: 0.3 }}>{c.name}</h2>
            <div style={{ color: "#b45309", fontWeight: 600, fontSize: 15, marginTop: 2 }}>{c.title}</div>
            <div style={{ color: "#57514a", fontSize: 13, marginTop: 6, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <span>✉ {c.email}</span><span>☎ {c.phone}</span><span>📍 {c.location}</span><span>in {c.linkedin}</span>
            </div>
          </header>

          <Section title="Professional Objective">
            <p style={{ margin: 0, lineHeight: 1.55 }}>{content.summary}</p>
          </Section>

          <Section title="Core Skills">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {content.skills.map((s) => (
                <span key={s} style={chip}>{s}</span>
              ))}
            </div>
          </Section>

          <Section title="Core Competencies">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {content.core_competencies.map((s) => (
                <span key={s} style={{ ...chip, background: "#f4efe6" }}>{s}</span>
              ))}
            </div>
          </Section>

          <Section title="Work Experience">
            {content.experience.map((e, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <strong>{e.title} · {e.company}</strong>
                  <span style={{ color: "#57514a", fontSize: 13 }}>{e.start} – {e.end}</span>
                </div>
                <div style={{ color: "#57514a", fontSize: 13, marginBottom: 4 }}>{e.location}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                  {e.bullets.map((b, k) => <li key={k}>{b}</li>)}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Education">
            {content.education.map((ed, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div><strong>{ed.degree}</strong> — {ed.school}<div style={{ color: "#57514a", fontSize: 13 }}>{ed.details}</div></div>
                <span style={{ color: "#57514a", fontSize: 13 }}>{ed.start} – {ed.end}</span>
              </div>
            ))}
          </Section>

          <Section title="Certifications">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              {content.certifications.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Section>
        </div>

        {/* Cover letter */}
        <h3 style={{ marginTop: 28 }}>✉ Matching Cover Letter</h3>
        <div style={{ ...sheet, whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{coverLetter}</div>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button onClick={pickResume} disabled={busy} className="btn btn-primary" style={{ padding: "12px 28px" }}>
            {busy ? "Adding…" : "✓ Pick this resume & customize"}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#b45309", margin: "0 0 8px" }}>{title}</h3>
      {children}
    </section>
  );
}

const sheet = {
  background: "#fff",
  border: "1px solid #e2dccf",
  borderRadius: 12,
  padding: "28px 30px",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

const chip = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 13,
  fontWeight: 500,
};
