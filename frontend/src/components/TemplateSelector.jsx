/**
 * Template gallery. Each card shows a miniature visual of the template's layout
 * (not just a color swatch) so the user can see how picking it restyles the
 * resume. Clicking a card switches the active template.
 */

function Thumb({ tpl }) {
  const accent = tpl.accent;
  const soft = tpl.accent_soft || "#eee";
  const layout = tpl.layout;

  // Each thumbnail is a tiny abstract resume rendered with the template's style.
  if (layout === "sidebar") {
    return (
      <div className="thumb">
        <div className="thumb-sidebar" style={{ background: accent }}>
          <span className="tl" style={{ background: "rgba(255,255,255,.9)", width: "70%" }} />
          <span className="tl" style={{ background: "rgba(255,255,255,.6)" }} />
          <span className="tl" style={{ background: "rgba(255,255,255,.6)" }} />
        </div>
        <div className="thumb-main">
          <span className="tl tl-head" style={{ background: accent }} />
          <span className="tl" /><span className="tl" /><span className="tl" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }
  if (layout === "banner") {
    return (
      <div className="thumb">
        <div className="thumb-banner" style={{ background: accent }}>
          <span className="tl" style={{ background: "rgba(255,255,255,.95)", width: "55%" }} />
          <span className="tl" style={{ background: "rgba(255,255,255,.6)", width: "40%" }} />
        </div>
        <div className="thumb-body">
          <span className="tl tl-head" style={{ background: accent }} />
          <div className="thumb-chips">
            <i style={{ background: soft }} /><i style={{ background: soft }} /><i style={{ background: soft }} />
          </div>
          <span className="tl" /><span className="tl" style={{ width: "70%" }} />
        </div>
      </div>
    );
  }
  // centered / single / minimal
  const centered = layout === "centered";
  return (
    <div className="thumb">
      <div className="thumb-body" style={{ paddingTop: 10 }}>
        <span
          className="tl"
          style={{
            background: layout === "single" ? accent : "#333",
            width: "55%", height: 5,
            margin: centered ? "0 auto 6px" : "0 0 6px",
          }}
        />
        <span
          className="tl tl-head"
          style={{
            background: accent,
            borderBottom: centered ? `2px solid ${accent}` : "none",
            width: layout === "minimal" ? "30%" : "40%",
          }}
        />
        <span className="tl" /><span className="tl" /><span className="tl" style={{ width: "65%" }} />
        <span className="tl tl-head" style={{ background: accent, width: "38%", marginTop: 6 }} />
        <span className="tl" /><span className="tl" style={{ width: "75%" }} />
      </div>
    </div>
  );
}

export default function TemplateSelector({ templates, active, onSelect }) {
  return (
    <div className="panel">
      <h3>Templates</h3>
      <p className="panel-hint">Pick a design — your résumé restyles instantly.</p>
      <div className="templates">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tpl ${active === t.id ? "active" : ""}`}
            onClick={() => onSelect(t.id)}
            title={t.description}
          >
            <Thumb tpl={t} />
            <div className="name">{t.name}</div>
            <div className="desc">
              {t.has_photo && <span className="tpl-photo-badge">📷 Photo</span>}
              {t.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
