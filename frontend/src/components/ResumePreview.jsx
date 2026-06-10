import { SECTION_LABELS } from "../lib";

function fmtRange(s, e) { return [s, e].filter(Boolean).join(" – "); }
function contactList(c) { return [c.email, c.phone, c.location, c.linkedin, c.website].filter(Boolean); }
const has = (arr) => Array.isArray(arr) && arr.length > 0;

function Experience({ items }) {
  if (!has(items)) return null;
  return items.map((e, i) => (
    <div className="pv-entry" key={i}>
      <div className="pv-entry-head">
        <span className="pv-role">{[e.title, e.company].filter(Boolean).join(", ")}</span>
        <span className="pv-meta">{fmtRange(e.start, e.end)}</span>
      </div>
      {e.location && <div className="pv-sub">{e.location}</div>}
      {has(e.bullets?.filter(Boolean)) && <ul>{e.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul>}
    </div>
  ));
}
function Education({ items }) {
  if (!has(items)) return null;
  return items.map((ed, i) => (
    <div className="pv-entry" key={i}>
      <div className="pv-entry-head">
        <span className="pv-role">{[ed.degree, ed.school].filter(Boolean).join(", ")}</span>
        <span className="pv-meta">{fmtRange(ed.start, ed.end)}</span>
      </div>
      {ed.details && <div className="pv-sub">{ed.details}</div>}
    </div>
  ));
}
function Projects({ items }) {
  if (!has(items)) return null;
  return items.map((p, i) => (
    <div className="pv-entry" key={i}>
      <div className="pv-role">{p.name}</div>
      {p.description && <div className="pv-sub">{p.description}</div>}
      {has(p.bullets?.filter(Boolean)) && <ul>{p.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul>}
    </div>
  ));
}
function SkillStars({ items }) {
  if (!has(items)) return null;
  return (
    <div className="pv-skill-stars">
      {items.map((s, i) => (
        <div key={i} className="pv-skill-star-row">
          <span className="pv-skill-name">{s.name}</span>
          <span className="pv-stars">{"★".repeat(s.rating)}{"☆".repeat(5 - s.rating)}</span>
        </div>
      ))}
    </div>
  );
}
function References({ items }) {
  if (!has(items)) return null;
  return items.map((r, i) => (
    <div className="pv-entry" key={i}>
      <div className="pv-role">{r.name}</div>
      <div className="pv-sub">{[r.title, r.company].filter(Boolean).join(", ")}</div>
      {r.contact && <div className="pv-sub">{r.contact}</div>}
    </div>
  ));
}
function InlineList({ items }) { return has(items) ? <div className="pv-skills-inline">{items.join("  •  ")}</div> : null; }
function Chips({ items }) {
  return has(items) ? <div className="pv-chips">{items.map((s,i) => <span className="pv-chip" key={i}>{s}</span>)}</div> : null;
}
function BulletList({ items }) { return has(items) ? <ul>{items.map((x,i) => <li key={i}>{x}</li>)}</ul> : null; }

function Section({ title, show, children }) {
  if (!show) return null;
  return <section className="pv-section-block"><h2 className="pv-section">{title}</h2>{children}</section>;
}

function PhotoCircle({ src }) {
  if (!src) return null;
  return <img src={src} alt="Profile" className="pv-photo" />;
}

function renderSection(key, content, layout) {
  const isBanner = layout === "banner";
  const isSidebar = layout === "sidebar";
  switch (key) {
    case "summary": return <Section title="Professional Summary" show={!!content.summary}><p className="pv-summary">{content.summary}</p></Section>;
    case "contact_info": return null; // rendered in header
    case "experience": return <Section title="Work History" show={has(content.experience)}><Experience items={content.experience}/></Section>;
    case "education": return <Section title="Education" show={has(content.education)}><Education items={content.education}/></Section>;
    case "skills": return <Section title="Skills" show={has(content.skills)}>{isBanner ? <Chips items={content.skills}/> : <InlineList items={content.skills}/>}</Section>;
    case "skill_ratings": return <Section title="Skills" show={has(content.skill_ratings)}><SkillStars items={content.skill_ratings}/></Section>;
    case "core_competencies": return <Section title="Core Competency" show={has(content.core_competencies)}><Chips items={content.core_competencies}/></Section>;
    case "projects": return <Section title="Projects" show={has(content.projects)}><Projects items={content.projects}/></Section>;
    case "certifications": return <Section title="Certifications" show={has(content.certifications)}><BulletList items={content.certifications}/></Section>;
    case "languages": return <Section title="Languages" show={has(content.languages)}>{isBanner ? <Chips items={content.languages}/> : <InlineList items={content.languages}/>}</Section>;
    case "accomplishments": return <Section title="Accomplishments" show={has(content.accomplishments)}><BulletList items={content.accomplishments}/></Section>;
    case "activities": return <Section title="Activities" show={has(content.activities)}><BulletList items={content.activities}/></Section>;
    case "references": return <Section title="References" show={has(content.references)}><References items={content.references}/></Section>;
    default: return null;
  }
}

function SidebarContent({ content, sidebarKeys }) {
  const c = content.contact || {};
  return (
    <>
      <PhotoCircle src={content.profile_photo} />
      <div className="pv-name">{c.name || "Your Name"}</div>
      {c.title && <div className="pv-title">{c.title}</div>}
      <div className="pv-aside-block"><h3>Contact</h3>
        {contactList(c).map((x,i) => <div className="pv-aside-line" key={i}>{x}</div>)}
      </div>
      {sidebarKeys.map(key => {
        const items = key === "skills" ? content.skills : key === "skill_ratings" ? content.skill_ratings :
          key === "languages" ? content.languages : key === "certifications" ? content.certifications :
          key === "core_competencies" ? content.core_competencies : null;
        if (!has(items)) return null;
        return (
          <div className="pv-aside-block" key={key}>
            <h3>{SECTION_LABELS[key] || key}</h3>
            {key === "skill_ratings" ? items.map((s,i) => (
              <div key={i} className="pv-aside-line"><span>{s.name}</span> <span className="pv-stars-sm">{"★".repeat(s.rating)}{"☆".repeat(5-s.rating)}</span></div>
            )) : items.map((s,i) => <div key={i} className="pv-aside-line">{typeof s === 'string' ? s : s.name}</div>)}
          </div>
        );
      })}
    </>
  );
}

export default function ResumePreview({ content, template }) {
  const tpl = template || { id: "classic", accent: "#1f2937", accent_soft: "#e5e7eb", font: "serif", layout: "centered" };
  const c = content.contact || {};
  const layout = tpl.layout || "single";
  const order = content.section_order || Object.keys(SECTION_LABELS);

  const style = {
    "--pv-accent": tpl.accent,
    "--pv-accent-soft": tpl.accent_soft || "#eee",
    "--pv-font": tpl.font === "serif" ? "'Source Serif 4', Georgia, serif" : "'Schibsted Grotesk', 'Spline Sans', system-ui, sans-serif",
  };

  const sidebarKeys = ["skills", "skill_ratings", "core_competencies", "certifications", "languages"];
  const mainKeys = order.filter(k => !sidebarKeys.includes(k) && k !== "contact_info");

  if (layout === "sidebar") {
    return (
      <div className={`pv-paper pv-${tpl.id} pv-layout-sidebar`} style={style}>
        <div className="pv-grid">
          <aside className="pv-aside"><SidebarContent content={content} sidebarKeys={sidebarKeys.filter(k => order.includes(k))} /></aside>
          <main className="pv-main">
            {mainKeys.map(key => <div key={key}>{renderSection(key, content, layout)}</div>)}
            {content.custom_sections?.map((cs, i) => <Section key={`c${i}`} title={cs.title} show={has(cs.items)}><BulletList items={cs.items}/></Section>)}
          </main>
        </div>
      </div>
    );
  }

  if (layout === "banner") {
    return (
      <div className={`pv-paper pv-${tpl.id} pv-layout-banner`} style={style}>
        <header className="pv-banner">
          {content.profile_photo && <PhotoCircle src={content.profile_photo} />}
          <div><div className="pv-name">{c.name || "Your Name"}</div>
          {c.title && <div className="pv-title">{c.title}</div>}
          <div className="pv-banner-contact">{contactList(c).join("   •   ")}</div></div>
        </header>
        <div className="pv-body">
          {order.filter(k => k !== "contact_info").map(key => <div key={key}>{renderSection(key, content, layout)}</div>)}
          {content.custom_sections?.map((cs, i) => <Section key={`c${i}`} title={cs.title} show={has(cs.items)}><Chips items={cs.items}/></Section>)}
        </div>
      </div>
    );
  }

  // Stacked layouts: centered, single, minimal
  const centered = layout === "centered";
  return (
    <div className={`pv-paper pv-${tpl.id} pv-layout-${layout}`} style={style}>
      <header className={centered ? "pv-head pv-head-center" : "pv-head"}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {content.profile_photo && <PhotoCircle src={content.profile_photo} />}
          <div>
            <div className="pv-name">{c.name || "Your Name"}</div>
            {c.title && <div className="pv-title">{c.title}</div>}
          </div>
        </div>
        {contactList(c).length > 0 && <div className="pv-contact">{contactList(c).join("   •   ")}</div>}
      </header>
      {order.filter(k => k !== "contact_info").map(key => <div key={key}>{renderSection(key, content, layout)}</div>)}
      {content.custom_sections?.map((cs, i) => <Section key={`c${i}`} title={cs.title} show={has(cs.items)}><BulletList items={cs.items}/></Section>)}
    </div>
  );
}
