import { useState } from "react";
import { api } from "../api/client";

export default function CoverLetterModal({ content, onClose }) {
  const [form, setForm] = useState({ job_title: "", company: "", job_description: "", tone: "professional" });
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.coverLetter({ content, ...form });
      setLetter(res.cover_letter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Generate cover letter</h3>
        {error && <div className="error">{error}</div>}
        <div className="row-2">
          <div className="field">
            <label>Job title</label>
            <input value={form.job_title} onChange={set("job_title")} />
          </div>
          <div className="field">
            <label>Company</label>
            <input value={form.company} onChange={set("company")} />
          </div>
        </div>
        <div className="field">
          <label>Job description (optional)</label>
          <textarea rows={3} value={form.job_description} onChange={set("job_description")} />
        </div>
        <div className="field">
          <label>Tone</label>
          <select value={form.tone} onChange={set("tone")}>
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
            <option value="confident">Confident</option>
            <option value="concise">Concise</option>
          </select>
        </div>
        <div className="toolbar">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={generate} disabled={busy}>
            {busy ? "Writing…" : letter ? "Regenerate" : "Generate"}
          </button>
          {letter && (
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        {letter && <div className="cover-text">{letter}</div>}
      </div>
    </div>
  );
}
