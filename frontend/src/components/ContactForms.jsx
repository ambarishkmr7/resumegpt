import { useState } from "react";

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function validate(fields, type) {
  const errs = {};
  if (!fields.name.trim() || fields.name.trim().length < 2) errs.name = "Name must be at least 2 characters";
  if (!EMAIL_RE.test(fields.email.trim())) errs.email = "Enter a valid email address (e.g. you@example.com)";
  if (type === "contact") {
    if (!fields.message.trim() || fields.message.trim().length < 10) errs.message = "Message must be at least 10 characters";
  } else {
    if (!fields.message.trim() || fields.message.trim().length < 5) errs.message = "Please share at least a few words";
  }
  return errs;
}

export function ContactForm() {
  const [fields, setFields] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const set = (k) => (e) => setFields((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(fields, "contact");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to send");
      setDone(data.message);
      setFields({ name: "", email: "", subject: "", message: "", website: "" });
    } catch (err) {
      setErrors({ _: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: 16, margin: "16px 0", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
        <p style={{ fontWeight: 600, color: "#166534", margin: 0 }}>{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 520, margin: "12px 0" }} noValidate>
      {errors._ && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginBottom: 10, color: "#991b1b", fontSize: 13 }}>{errors._}</div>}

      {/* Honeypot */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }} aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={fields.website} onChange={set("website")} />
      </div>

      <Field label="Your Name *" error={errors.name}>
        <input value={fields.name} onChange={set("name")} placeholder="e.g. Rahul Sharma" autoComplete="name" />
      </Field>
      <Field label="Email Address *" error={errors.email}>
        <input type="email" value={fields.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
      </Field>
      <Field label="Subject" error={errors.subject}>
        <input value={fields.subject} onChange={set("subject")} placeholder="What's this about?" />
      </Field>
      <Field label="Message *" error={errors.message}>
        <textarea rows={3} value={fields.message} onChange={set("message")} placeholder="Write your message here…" />
      </Field>

      <button type="submit" disabled={busy} style={{
        background: "#b45309", color: "#fff", border: "none", borderRadius: 9,
        padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%",
        opacity: busy ? 0.7 : 1
      }}>
        {busy ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}

export function FeedbackForm() {
  const [fields, setFields] = useState({ name: "", email: "", message: "", rating: 5, website: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const set = (k) => (e) => setFields((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(fields, "feedback");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/public/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, rating: Number(fields.rating) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to send");
      setDone(data.message);
      setFields({ name: "", email: "", message: "", rating: 5, website: "" });
    } catch (err) {
      setErrors({ _: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: 20, margin: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🙏</div>
        <p style={{ fontWeight: 600, color: "#166534", margin: 0 }}>{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 520, margin: "12px 0" }} noValidate>
      {errors._ && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginBottom: 10, color: "#991b1b", fontSize: 13 }}>{errors._}</div>}

      {/* Honeypot */}
      <div style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }} aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={fields.website} onChange={set("website")} />
      </div>

      <Field label="Your Name *" error={errors.name}>
        <input value={fields.name} onChange={set("name")} placeholder="e.g. Priya Singh" autoComplete="name" />
      </Field>
      <Field label="Email Address *" error={errors.email}>
        <input type="email" value={fields.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
      </Field>
      <Field label="Rating">
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button"
              onClick={() => setFields((p) => ({ ...p, rating: s }))}
              style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", opacity: fields.rating >= s ? 1 : 0.3, transition: "opacity .15s" }}>
              ⭐
            </button>
          ))}
          <span style={{ alignSelf: "center", fontSize: 12, color: "#57514a", marginLeft: 4 }}>
            {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][fields.rating]}
          </span>
        </div>
      </Field>
      <Field label="Your Feedback *" error={errors.message}>
        <textarea rows={3} value={fields.message} onChange={set("message")} placeholder="Tell us what you think — what's working, what could be better…" />
      </Field>

      <button type="submit" disabled={busy} style={{
        background: "#b45309", color: "#fff", border: "none", borderRadius: 9,
        padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", width: "100%",
        opacity: busy ? 0.7 : 1
      }}>
        {busy ? "Submitting…" : "Submit Feedback"}
      </button>
    </form>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#57514a" }}>{label}</label>
      {children}
      {error && <p style={{ color: "#dc2626", fontSize: 12, margin: "3px 0 0" }}>⚠ {error}</p>}
    </div>
  );
}
