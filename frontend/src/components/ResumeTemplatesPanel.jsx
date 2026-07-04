import { useState } from "react";
import { Link } from "react-router-dom";
import { TEMPLATE_META } from "../data/resumeTemplates.js";

// Collapsible panel that reveals links to all free resume templates.
// Each link opens /resume-template/:slug in the same tab (use target="_blank"
// via the small "↗" affordance to open in a new tab).
export default function ResumeTemplatesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="section">
      <div className="rt-panel">
        <button
          className="rt-panel-head"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>
            <span className="rt-panel-icon">📄</span>
            <strong>Free Resume Templates</strong>
            <span className="rt-panel-sub">{TEMPLATE_META.length} job-specific samples — objective, experience & cover letter</span>
          </span>
          <span className={`rt-caret ${open ? "open" : ""}`}>▾</span>
        </button>

        {open && (
          <div className="rt-grid">
            {TEMPLATE_META.map((t) => (
              <Link key={t.slug} to={`/resume-template/${t.slug}`} className="rt-link">
                <span>{t.label}</span>
                <span
                  className="rt-link-new"
                  title="Open in new tab"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(`/resume-template/${t.slug}`, "_blank", "noopener,noreferrer");
                  }}
                >↗</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .rt-panel { background:#fff; border:1px solid #e2dccf; border-radius:14px; overflow:hidden; }
        .rt-panel-head {
          width:100%; display:flex; align-items:center; justify-content:space-between;
          gap:12px; padding:18px 22px; background:transparent; border:none; cursor:pointer;
          text-align:left; font-size:16px; color:#2b2723;
        }
        .rt-panel-head:hover { background:#fffdf8; }
        .rt-panel-icon { font-size:20px; margin-right:10px; }
        .rt-panel-sub { display:block; font-size:12.5px; color:#57514a; font-weight:400; margin-top:3px; margin-left:30px; }
        .rt-caret { transition:transform .2s; color:#b45309; font-size:18px; }
        .rt-caret.open { transform:rotate(180deg); }
        .rt-grid {
          display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));
          gap:8px; padding:8px 18px 20px;
        }
        .rt-link {
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:10px 14px; border:1px solid #ece6da; border-radius:9px;
          text-decoration:none; color:#2b2723; font-size:14px; font-weight:500; background:#fff;
          transition:border-color .15s, background .15s, transform .1s;
        }
        .rt-link:hover { border-color:#fdba74; background:#fff7ed; transform:translateY(-1px); }
        .rt-link-new { color:#b45309; font-weight:700; padding:0 4px; }
        @media (max-width:640px){ .rt-panel-sub { margin-left:0; } }
      `}</style>
    </section>
  );
}
