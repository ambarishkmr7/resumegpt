import { useEffect, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../components/Seo.jsx";
import { api } from "../api/client";
import { RESOURCE_PAGES, AUTHORS } from "../data/resourcePages.js";

function Avatar({ name, src }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: 48, height: 48, flex: "0 0 48px", borderRadius: "50%", objectFit: "cover" }} />;
  }
  return (
    <div style={{
      width: 48, height: 48, flex: "0 0 48px", borderRadius: "50%",
      background: "linear-gradient(135deg,#d97706,#7c3d12)", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18,
    }}>
      {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </div>
  );
}

function AuthorCard({ id }) {
  const a = AUTHORS.find((x) => x.id === id);
  if (!a) return null;
  return (
    <div style={{ display: "flex", gap: 14, padding: 16, border: "1px solid #e2dccf", borderRadius: 12, background: "#fff" }}>
      <Avatar name={a.name} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
        <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600, marginBottom: 4 }}>{a.role}</div>
        <p style={{ fontSize: 13, color: "#57514a", lineHeight: 1.6, margin: 0 }}>{a.bio}</p>
      </div>
    </div>
  );
}

// Author loaded from the database, with their published posts.
function DbAuthorCard({ author }) {
  return (
    <div style={{ padding: 16, border: "1px solid #e2dccf", borderRadius: 12, background: "#fff" }}>
      <div style={{ display: "flex", gap: 14 }}>
        <Avatar name={author.name} src={author.avatar_url} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{author.name}</span>
            {author.credentials && (
              <span style={{ fontSize: 11, color: "#b45309", background: "#fde9c8", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{author.credentials}</span>
            )}
          </div>
          {author.role && <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600, margin: "2px 0 4px" }}>{author.role}</div>}
          {author.bio && <p style={{ fontSize: 13, color: "#57514a", lineHeight: 1.6, margin: 0 }}>{author.bio}</p>}
          {author.linkedin_url && (
            <a href={author.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>LinkedIn ↗</a>
          )}
        </div>
      </div>

      {author.posts && author.posts.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid #eee5d6", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Posts by {author.name.split(" ")[0]}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {author.posts.map((p) => (
              <article key={p.id} style={{ background: "#faf6ee", border: "1px solid #eee5d6", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#2a2620" }}>{p.title}</div>
                {p.excerpt && <p style={{ fontSize: 12.5, color: "#57514a", margin: "4px 0 0", lineHeight: 1.55 }}>{p.excerpt}</p>}
                {p.content && (
                  <p style={{ fontSize: 12.5, color: "#6b6258", margin: "6px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {p.content.length > 320 ? p.content.slice(0, 320) + "…" : p.content}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResourcePage() {
  const { slug } = useParams();
  const page = RESOURCE_PAGES[slug];

  const [dbAuthors, setDbAuthors] = useState(null);
  useEffect(() => {
    if (slug === "editorial-team") {
      api.listAuthors().then((list) => setDbAuthors(Array.isArray(list) ? list : [])).catch(() => setDbAuthors([]));
    }
  }, [slug]);

  if (!page) return <Navigate to="/" replace />;


  return (
    <>
      <Topbar />
      <Seo
        title={`${page.title} — resumes-gpt`}
        description={page.intro.slice(0, 155)}
      />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px 56px" }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 18 }}>← Back</Link>

        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 6px" }}>{page.title}</h1>
        {page.subtitle && (
          <p style={{ fontSize: 16, color: "#57514a", margin: "0 0 8px" }}>{page.subtitle}</p>
        )}
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 20px" }}>
          Last updated: {page.updated} · Last reviewed: {page.reviewed}
        </p>

        <p style={{ fontSize: 15, color: "#3f3a34", lineHeight: 1.75, marginBottom: 28 }}>{page.intro}</p>

        {page.sections.map((s, i) => (
          <section key={i} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>{s.heading}</h2>

            {s.body &&
              s.body.map((p, k) => (
                <p key={k} style={{ fontSize: 14.5, color: "#3f3a34", lineHeight: 1.75, margin: "0 0 12px" }}>{p}</p>
              ))}

            {s.list && (
              <ul style={{ paddingLeft: 20, color: "#3f3a34", lineHeight: 1.8, fontSize: 14.5 }}>
                {s.list.map((li, k) => <li key={k}>{li}</li>)}
              </ul>
            )}

            {s.authors && (
              <div style={{ display: "grid", gap: 12 }}>
                {dbAuthors && dbAuthors.length > 0
                  ? dbAuthors.map((a) => <DbAuthorCard key={a.id} author={a} />)
                  : s.authors.map((id) => <AuthorCard key={id} id={id} />)}
              </div>
            )}

            {s.table && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                  <thead>
                    <tr>
                      {s.table[0].map((h, k) => (
                        <th key={k} style={{ textAlign: "left", padding: "10px 12px", background: "#faf6ee", borderBottom: "2px solid #e2dccf", fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.slice(1).map((row, r) => (
                      <tr key={r}>
                        {row.map((c, k) => (
                          <td key={k} style={{ padding: "10px 12px", borderBottom: "1px solid #eee5d6", color: "#57514a" }}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {s.references && (
              <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 14.5 }}>
                {s.references.map((ref, k) => (
                  <li key={k}>
                    <a href={ref.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "#b45309" }}>{ref.label}</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <Footer />
    </>
  );
}
