import { useState, useRef } from "react";
import { SECTION_LABELS, DEFAULT_SECTION_ORDER, emptyExperience, emptyEducation, emptyProject, emptyReference, emptySkillRating, emptyCustomSection } from "../lib";

/* ---- Drag helpers for reordering items within a section ---- */
function useDragReorder(items, onReorder) {
  const dragIdx = useRef(null);
  const onDragStart = (i) => (e) => { dragIdx.current = i; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (i) => (e) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) return;
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(i, 0, moved);
    onReorder(arr);
    dragIdx.current = null;
  };
  return { onDragStart, onDragOver, onDrop };
}

/* ---- Sub-components ---- */
function Field({ label, value, onChange, textarea, rows }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <div className="field">
      <label>{label}</label>
      <Tag value={value || ""} onChange={(e) => onChange(e.target.value)}
        rows={textarea ? (rows || 4) : undefined} />
    </div>
  );
}

function BulletEditor({ items, onChange }) {
  const update = (i, val) => { const a = [...items]; a[i] = val; onChange(a); };
  const add = () => onChange([...items, ""]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  return (
    <div className="bullet-editor">
      {items.map((b, i) => (
        <div key={i} className="bullet-row">
          <span className="bullet-dot">•</span>
          <input value={b} onChange={(e) => update(i, e.target.value)} placeholder="Achievement or responsibility…" />
          <button type="button" className="btn-x" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={add}>+ Add bullet</button>
    </div>
  );
}

function ChipEditor({ items, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => { if (input.trim()) { onChange([...items, input.trim()]); setInput(""); } };
  return (
    <div className="chip-editor">
      <div className="chips">{items.map((s, i) => (
        <span key={i} className="chip">{s}<button className="chip-x" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button></span>
      ))}</div>
      <div className="chip-input-row">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder || "Type and press Enter…"}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function StarInput({ rating, onChange }) {
  return (
    <div className="star-input">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" className={n <= rating ? "star-filled" : "star-empty"}
          onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

/* ---- Section tabs config ---- */
const ALL_TABS = [
  { key: "summary", label: "Professional Summary" },
  { key: "contact_info", label: "Contact" },
  { key: "experience", label: "Work History" },
  { key: "education", label: "Education" },
  { key: "skill_ratings", label: "Skills" },
  { key: "core_competencies", label: "Core Competency" },
  { key: "certifications", label: "Certification" },
  { key: "projects", label: "Projects" },
  { key: "accomplishments", label: "Accomplishments" },
  { key: "languages", label: "Languages" },
  { key: "activities", label: "Activities" },
  { key: "references", label: "References" },
  { key: "photo", label: "Profile Photo" },
  { key: "custom", label: "Custom Sections" },
];

/* ---- Main form ---- */
export default function ResumeForm({ content, onChange }) {
  const [tab, setTab] = useState("summary");
  const c = content.contact || {};

  const setField = (section, field, val) => {
    const next = { ...content };
    if (section === "contact") next.contact = { ...c, [field]: val };
    else next[field] = val;
    onChange(next);
  };
  const setList = (key, val) => onChange({ ...content, [key]: val });

  // Experience helpers
  const exp = content.experience || [];
  const expDrag = useDragReorder(exp, (a) => setList("experience", a));
  const setExp = (i, field, val) => {
    const a = [...exp]; a[i] = { ...a[i], [field]: val }; setList("experience", a);
  };

  // Education helpers
  const edu = content.education || [];
  const eduDrag = useDragReorder(edu, (a) => setList("education", a));
  const setEdu = (i, field, val) => {
    const a = [...edu]; a[i] = { ...a[i], [field]: val }; setList("education", a);
  };

  // Projects helpers
  const proj = content.projects || [];
  const projDrag = useDragReorder(proj, (a) => setList("projects", a));
  const setProj = (i, field, val) => {
    const a = [...proj]; a[i] = { ...a[i], [field]: val }; setList("projects", a);
  };

  // Skill ratings
  const ratings = content.skill_ratings || [];
  const ratingDrag = useDragReorder(ratings, (a) => setList("skill_ratings", a));

  // References
  const refs = content.references || [];
  const refDrag = useDragReorder(refs, (a) => setList("references", a));
  const setRef = (i, field, val) => {
    const a = [...refs]; a[i] = { ...a[i], [field]: val }; setList("references", a);
  };

  // Custom sections
  const customs = content.custom_sections || [];

  // Photo upload
  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange({ ...content, profile_photo: ev.target.result });
    reader.readAsDataURL(file);
  };

  return (
    <div className="panel form-panel">
      <div className="form-tabs">
        {ALL_TABS.map(t => (
          <button key={t.key} className={`form-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="form-body">
        {/* Summary */}
        {tab === "summary" && (
          <Field label="Professional Summary" value={content.summary}
            onChange={(v) => setField(null, "summary", v)} textarea rows={5} />
        )}

        {/* Contact */}
        {tab === "contact_info" && (
          <>
            <Field label="Full Name" value={c.name} onChange={(v) => setField("contact", "name", v)} />
            <Field label="Professional Title" value={c.title} onChange={(v) => setField("contact", "title", v)} />
            <Field label="Email" value={c.email} onChange={(v) => setField("contact", "email", v)} />
            <Field label="Phone" value={c.phone} onChange={(v) => setField("contact", "phone", v)} />
            <Field label="Location" value={c.location} onChange={(v) => setField("contact", "location", v)} />
            <Field label="LinkedIn" value={c.linkedin} onChange={(v) => setField("contact", "linkedin", v)} />
            <Field label="Website" value={c.website} onChange={(v) => setField("contact", "website", v)} />
          </>
        )}

        {/* Work History */}
        {tab === "experience" && (
          <>
            {exp.map((e, i) => (
              <div key={i} className="list-item" draggable onDragStart={expDrag.onDragStart(i)}
                onDragOver={expDrag.onDragOver} onDrop={expDrag.onDrop(i)}>
                <div className="list-item-head">
                  <span className="drag-handle">⠿</span>
                  <strong>{e.title || e.company || `Role ${i + 1}`}</strong>
                  <button className="btn-x" onClick={() => setList("experience", exp.filter((_, j) => j !== i))}>×</button>
                </div>
                <Field label="Job Title" value={e.title} onChange={(v) => setExp(i, "title", v)} />
                <Field label="Company" value={e.company} onChange={(v) => setExp(i, "company", v)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="Start" value={e.start} onChange={(v) => setExp(i, "start", v)} />
                  <Field label="End" value={e.end} onChange={(v) => setExp(i, "end", v)} />
                </div>
                <Field label="Location" value={e.location} onChange={(v) => setExp(i, "location", v)} />
                <label style={{ fontSize: 13, fontWeight: 600, marginTop: 8, display: "block" }}>Bullets</label>
                <BulletEditor items={e.bullets || []} onChange={(b) => setExp(i, "bullets", b)} />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
              onClick={() => setList("experience", [...exp, emptyExperience()])}>+ Add role</button>
          </>
        )}

        {/* Education */}
        {tab === "education" && (
          <>
            {edu.map((e, i) => (
              <div key={i} className="list-item" draggable onDragStart={eduDrag.onDragStart(i)}
                onDragOver={eduDrag.onDragOver} onDrop={eduDrag.onDrop(i)}>
                <div className="list-item-head">
                  <span className="drag-handle">⠿</span>
                  <strong>{e.degree || e.school || `Education ${i + 1}`}</strong>
                  <button className="btn-x" onClick={() => setList("education", edu.filter((_, j) => j !== i))}>×</button>
                </div>
                <Field label="Degree" value={e.degree} onChange={(v) => setEdu(i, "degree", v)} />
                <Field label="School" value={e.school} onChange={(v) => setEdu(i, "school", v)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="Start" value={e.start} onChange={(v) => setEdu(i, "start", v)} />
                  <Field label="End" value={e.end} onChange={(v) => setEdu(i, "end", v)} />
                </div>
                <Field label="Details" value={e.details} onChange={(v) => setEdu(i, "details", v)} />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
              onClick={() => setList("education", [...edu, emptyEducation()])}>+ Add education</button>
          </>
        )}

        {/* Skills (chips) */}
        {/* Skills with star rating (merged - single skills section) */}
        {tab === "skill_ratings" && (
          <>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
              Add your skills with proficiency level (1-5 stars). Stars appear in the resume preview.
            </p>
            {ratings.map((r, i) => (
              <div key={i} className="list-item-inline" draggable onDragStart={ratingDrag.onDragStart(i)}
                onDragOver={ratingDrag.onDragOver} onDrop={ratingDrag.onDrop(i)}>
                <span className="drag-handle">⠿</span>
                <input value={r.name} onChange={(e) => { const a = [...ratings]; a[i] = {...r, name: e.target.value}; setList("skill_ratings", a); }}
                  placeholder="Skill name" style={{ flex: 1 }} />
                <StarInput rating={r.rating} onChange={(v) => { const a = [...ratings]; a[i] = {...r, rating: v}; setList("skill_ratings", a); }} />
                <button className="btn-x" onClick={() => setList("skill_ratings", ratings.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm add-item-btn"
              onClick={() => setList("skill_ratings", [...ratings, emptySkillRating()])}>+ Add skill</button>
          </>
        )}

        {/* Core Competencies */}
        {tab === "core_competencies" && (
          <ChipEditor items={content.core_competencies || []} onChange={(l) => setList("core_competencies", l)} placeholder="Add competency…" />
        )}

        {/* Certifications */}
        {tab === "certifications" && (
          <ChipEditor items={content.certifications || []} onChange={(l) => setList("certifications", l)} placeholder="Add certification…" />
        )}

        {/* Projects */}
        {tab === "projects" && (
          <>
            {proj.map((p, i) => (
              <div key={i} className="list-item" draggable onDragStart={projDrag.onDragStart(i)}
                onDragOver={projDrag.onDragOver} onDrop={projDrag.onDrop(i)}>
                <div className="list-item-head">
                  <span className="drag-handle">⠿</span>
                  <strong>{p.name || `Project ${i + 1}`}</strong>
                  <button className="btn-x" onClick={() => setList("projects", proj.filter((_, j) => j !== i))}>×</button>
                </div>
                <Field label="Name" value={p.name} onChange={(v) => setProj(i, "name", v)} />
                <Field label="Description" value={p.description} onChange={(v) => setProj(i, "description", v)} />
                <label style={{ fontSize: 13, fontWeight: 600, marginTop: 8, display: "block" }}>Bullets</label>
                <BulletEditor items={p.bullets || []} onChange={(b) => setProj(i, "bullets", b)} />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
              onClick={() => setList("projects", [...proj, emptyProject()])}>+ Add project</button>
          </>
        )}

        {/* Accomplishments */}
        {tab === "accomplishments" && (
          <ChipEditor items={content.accomplishments || []} onChange={(l) => setList("accomplishments", l)} placeholder="Add accomplishment…" />
        )}

        {/* Languages */}
        {tab === "languages" && (
          <ChipEditor items={content.languages || []} onChange={(l) => setList("languages", l)} placeholder="Add language…" />
        )}

        {/* Activities */}
        {tab === "activities" && (
          <ChipEditor items={content.activities || []} onChange={(l) => setList("activities", l)} placeholder="Add activity…" />
        )}

        {/* References */}
        {tab === "references" && (
          <>
            {refs.map((r, i) => (
              <div key={i} className="list-item" draggable onDragStart={refDrag.onDragStart(i)}
                onDragOver={refDrag.onDragOver} onDrop={refDrag.onDrop(i)}>
                <div className="list-item-head">
                  <span className="drag-handle">⠿</span>
                  <strong>{r.name || `Reference ${i + 1}`}</strong>
                  <button className="btn-x" onClick={() => setList("references", refs.filter((_, j) => j !== i))}>×</button>
                </div>
                <Field label="Name" value={r.name} onChange={(v) => setRef(i, "name", v)} />
                <Field label="Title" value={r.title} onChange={(v) => setRef(i, "title", v)} />
                <Field label="Company" value={r.company} onChange={(v) => setRef(i, "company", v)} />
                <Field label="Contact (email/phone)" value={r.contact} onChange={(v) => setRef(i, "contact", v)} />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
              onClick={() => setList("references", [...refs, emptyReference()])}>+ Add reference</button>
          </>
        )}

        {/* Profile Photo */}
        {tab === "photo" && (
          <div className="photo-section">
            {content.profile_photo && (
              <div className="photo-preview">
                <img src={content.profile_photo} alt="Profile" />
                <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ...content, profile_photo: "" })}>
                  Remove photo
                </button>
              </div>
            )}
            <div className="field">
              <label>Upload profile photo</label>
              <input type="file" accept="image/*" onChange={handlePhoto} />
            </div>
            <p className="panel-hint">Photo appears in sidebar and banner templates (marked with 📷).</p>
          </div>
        )}

        {/* Custom Sections */}
        {tab === "custom" && (
          <>
            {customs.map((cs, ci) => (
              <div key={ci} className="list-item">
                <div className="list-item-head">
                  <strong>{cs.title}</strong>
                  <button className="btn-x" onClick={() => setList("custom_sections", customs.filter((_, j) => j !== ci))}>×</button>
                </div>
                <Field label="Section Title" value={cs.title} onChange={(v) => {
                  const a = [...customs]; a[ci] = {...cs, title: v}; setList("custom_sections", a);
                }} />
                <ChipEditor items={cs.items} onChange={(items) => {
                  const a = [...customs]; a[ci] = {...cs, items}; setList("custom_sections", a);
                }} placeholder="Add item…" />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}
              onClick={() => setList("custom_sections", [...customs, emptyCustomSection()])}>
              + Add custom section
            </button>
          </>
        )}
      </div>
    </div>
  );
}
