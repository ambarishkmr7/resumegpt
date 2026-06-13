import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { SkeletonBlock, SkeletonLine, SkeletonCircle, SkeletonButton } from "../components/Skeleton.jsx";

/* ─── Helpers ─── */
function pctColor(pct) {
  if (pct >= 70) return "var(--good)";
  if (pct >= 40) return "var(--warn)";
  return "var(--crit)";
}

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="profile-section">
      <button className="profile-section-header" onClick={() => setOpen(!open)} type="button">
        <span>{icon} {title}</span>
        <span className="profile-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </div>
  );
}

function F({ label, value, onChange, type = "text", placeholder = "", readOnly = false }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={readOnly ? { background: "#f0ece4", cursor: "not-allowed" } : {}}
      />
    </div>
  );
}

function FRow({ children }) {
  return <div className="row-2">{children}</div>;
}

function ChipInput({ items, onChange, placeholder = "Type and press Enter" }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !items.includes(v)) {
      onChange([...items, v]);
      setInput("");
    }
  };
  return (
    <div className="chip-editor">
      <div className="chips">
        {items.map((s, i) => (
          <span key={i} className="chip">
            {s}
            <button className="chip-x" type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="chip-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function ListEditor({ items, onChange, emptyItem, renderItem, addLabel }) {
  const add = () => onChange([...items, { ...emptyItem }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const update = (i, field, val) => {
    const arr = [...items];
    arr[i] = { ...arr[i], [field]: val };
    onChange(arr);
  };
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="subitem">
          <div className="subitem-head">
            <span style={{ fontWeight: 600, fontSize: 14 }}>#{i + 1}</span>
            <button type="button" className="link-btn danger" onClick={() => remove(i)}>Remove</button>
          </div>
          {renderItem(item, i, update)}
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={add}>+ {addLabel}</button>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [pct, setPct] = useState(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");

  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [skills, setSkills] = useState([]);

  const [desiredRole, setDesiredRole] = useState("");
  const [prefLocations, setPrefLocations] = useState([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [jobType, setJobType] = useState("");
  const [remotePref, setRemotePref] = useState("");

  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState(false);
  const photoRef = useRef();

  const load = useCallback(() => {
    setLoading(true);
    api.getProfile()
      .then((data) => {
        const p = data.personal || {};
        setFullName(p.full_name || "");
        setEmail(p.email || "");
        setPhone(p.phone || "");
        setLocation(p.location || "");
        setLinkedinUrl(p.linkedin_url || "");
        setHeadline(p.headline || "");
        setSummary(p.summary || "");
        setEducation(data.education || []);
        setExperience(data.experience || []);
        setSkills(data.skills || []);
        const pr = data.preferences || {};
        setDesiredRole(pr.desired_role || "");
        setPrefLocations(pr.preferred_locations || []);
        setSalaryMin(pr.expected_salary_min || "");
        setSalaryMax(pr.expected_salary_max || "");
        setJobType(pr.job_type || "");
        setRemotePref(pr.remote_preference || "");
        setPct(data.profile_completion || 0);
        if (data.profile_photo_key) {
          setPhotoPreview(`/api/profile/photo?key=${data.profile_photo_key}`);
          setPhotoError(false);
        }
      })
      .catch((e) => console.error("Failed to load profile:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const buildPayload = () => ({
    personal: { full_name: fullName, email, phone, location, linkedin_url: linkedinUrl, headline, summary },
    education: education.map((e) => ({
      degree: e.degree || "",
      school: e.school || "",
      location: e.location || "",
      start_year: e.start_year || "",
      end_year: e.end_year || "",
      grade: e.grade || "",
    })),
    experience: experience.map((e) => ({
      title: e.title || "",
      company: e.company || "",
      location: e.location || "",
      start_date: e.start_date || "",
      end_date: e.end_date || "",
      current: e.current || false,
      description: e.description || "",
    })),
    skills,
    preferences: {
      desired_role: desiredRole,
      preferred_locations: prefLocations,
      expected_salary_min: salaryMin,
      expected_salary_max: salaryMax,
      job_type: jobType,
      remote_preference: remotePref,
    },
  });

  const { refreshProfilePhoto } = useAuth();

  const save = useCallback(async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const data = await api.updateProfile(buildPayload());
      setPct(data.profile_completion || 0);
      setSaveMsg("✅ Profile saved successfully!");
      if (photoFile) {
        await api.uploadProfilePhoto(photoFile);
        setPhotoFile(null);
        refreshProfilePhoto();
      }
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) {
      setSaveMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [buildPayload, photoFile, fullName, email, phone, location, linkedinUrl, headline, summary, education, experience, skills, desiredRole, prefLocations, salaryMin, salaryMax, jobType, remotePref, refreshProfilePhoto]);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoError(false);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <>
        <Topbar />
        <div className="container" style={{ maxWidth: 820 }}>
          {/* Header skeleton */}
          <div className="profile-header" style={{ marginBottom: 12 }}>
            <div>
              <SkeletonBlock width={180} height={32} borderRadius={6} style={{ marginBottom: 8 }} />
              <SkeletonLine width={340} height={14} />
            </div>
            <SkeletonCircle size={72} />
          </div>

          {/* Completion bar skeleton */}
          <SkeletonBlock width="100%" height={8} borderRadius={4} style={{ marginBottom: 24 }} />

          {/* Section skeletons */}
          {["Personal Details", "Education", "Work Experience", "Skills", "Career Preferences"].map((title) => (
            <div key={title} className="profile-section" style={{ marginBottom: 18 }}>
              <div className="profile-section-header" style={{ cursor: "default" }}>
                <SkeletonLine width={160} height={18} />
              </div>
              <div className="profile-section-body">
                <div className="row-2">
                  <div className="field"><SkeletonLine width={80} height={13} style={{ marginBottom: 6 }} /><SkeletonBlock width="100%" height={42} borderRadius={9} /></div>
                  <div className="field"><SkeletonLine width={80} height={13} style={{ marginBottom: 6 }} /><SkeletonBlock width="100%" height={42} borderRadius={9} /></div>
                </div>
                <div className="row-2" style={{ marginTop: 12 }}>
                  <div className="field"><SkeletonLine width={80} height={13} style={{ marginBottom: 6 }} /><SkeletonBlock width="100%" height={42} borderRadius={9} /></div>
                  <div className="field"><SkeletonLine width={80} height={13} style={{ marginBottom: 6 }} /><SkeletonBlock width="100%" height={42} borderRadius={9} /></div>
                </div>
              </div>
            </div>
          ))}

          {/* Save button skeleton */}
          <SkeletonButton width={140} height={44} borderRadius={9} />
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Topbar />
      <div className="container" style={{ maxWidth: 820 }}>
        {/* ── Header + Completion ── */}
        <div className="profile-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 28 }}>My Profile</h2>
            <p style={{ color: "var(--ink-soft)", margin: "4px 0 0", fontSize: 14 }}>
              Complete your profile to get better job recommendations and career advice.
            </p>
          </div>
          <div className="profile-completion">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="32" fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle
                cx="36" cy="36" r="32" fill="none"
                stroke={pctColor(pct)} strokeWidth="6"
                strokeDasharray={`${(pct / 100) * 201} 201`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
              <text x="36" y="40" textAnchor="middle" fontSize="16" fontWeight="700" fill={pctColor(pct)} fontFamily="var(--display)">
                {pct}%
              </text>
            </svg>
          </div>
        </div>

        {/* ── Completion bar ── */}
        <div className="profile-completion-bar" style={{ marginBottom: 24 }}>
          <div
            className="profile-completion-fill"
            style={{
              width: `${pct}%`,
              background: pctColor(pct),
              height: 8,
              borderRadius: 4,
              transition: "width 0.5s ease",
            }}
          />
        </div>

        {pct < 100 && (
          <div className="notice" style={{ marginBottom: 20 }}>
            💡 Your profile is <strong>{pct}% complete</strong>. Fill in all sections to unlock personalized job recommendations and career insights.
          </div>
        )}
        {pct === 100 && (
          <div className="notice" style={{ marginBottom: 20, background: "#e6f0e9", color: "var(--good)" }}>
            🎉 Your profile is <strong>100% complete</strong>! You'll get the best job matches and career advice.
          </div>
        )}

        {/* ── Personal Details ── */}
        <Section title="Personal Details" icon="👤">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 20 }}>
            <div style={{ textAlign: "center" }}>
              {photoPreview && !photoError ? (
                <img src={photoPreview} alt="Profile" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)" }} onError={() => setPhotoError(true)} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent-soft)", display: "grid", placeItems: "center", fontSize: 28, color: "var(--accent)" }}>
                  {fullName ? fullName[0].toUpperCase() : "?"}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <button type="button" className="link-btn" onClick={() => photoRef.current?.click()}>
                  {photoPreview ? "Change" : "Upload"} Photo
                </button>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhotoChange} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <FRow>
                <F label="Full Name" value={fullName} onChange={setFullName} placeholder="e.g. Rahul Sharma" />
                <F label="Email" value={email} onChange={setEmail} readOnly />
              </FRow>
            </div>
          </div>
          <FRow>
            <F label="Phone" value={phone} onChange={setPhone} placeholder="+91 98765 43210" />
            <F label="Location" value={location} onChange={setLocation} placeholder="e.g. Bangalore, India" />
          </FRow>
          <FRow>
            <F label="LinkedIn URL" value={linkedinUrl} onChange={setLinkedinUrl} placeholder="https://linkedin.com/in/yourname" />
            <F label="Professional Headline" value={headline} onChange={setHeadline} placeholder="e.g. Senior Full-Stack Engineer" />
          </FRow>
          <div className="field">
            <label>Professional Summary</label>
            <textarea
              value={summary || ""}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Brief overview of your career, key skills, and what you're looking for…"
            />
          </div>
        </Section>

        {/* ── Education ── */}
        <Section title="Education" icon="🎓">
          <ListEditor
            items={education}
            onChange={setEducation}
            emptyItem={{ degree: "", school: "", location: "", start_year: "", end_year: "", grade: "" }}
            addLabel="Add Education"
            renderItem={(item, i, update) => (
              <>
                <FRow>
                  <F label="Degree" value={item.degree} onChange={(v) => update(i, "degree", v)} placeholder="e.g. B.Tech Computer Science" />
                  <F label="School / University" value={item.school} onChange={(v) => update(i, "school", v)} placeholder="e.g. IIT Delhi" />
                </FRow>
                <FRow>
                  <F label="Location" value={item.location} onChange={(v) => update(i, "location", v)} placeholder="e.g. New Delhi" />
                  <F label="Grade / GPA" value={item.grade} onChange={(v) => update(i, "grade", v)} placeholder="e.g. 8.5 CGPA" />
                </FRow>
                <FRow>
                  <F label="Start Year" value={item.start_year} onChange={(v) => update(i, "start_year", v)} placeholder="e.g. 2018" />
                  <F label="End Year" value={item.end_year} onChange={(v) => update(i, "end_year", v)} placeholder="e.g. 2022" />
                </FRow>
              </>
            )}
          />
        </Section>

        {/* ── Work Experience ── */}
        <Section title="Work Experience" icon="💼">
          <ListEditor
            items={experience}
            onChange={setExperience}
            emptyItem={{ title: "", company: "", location: "", start_date: "", end_date: "", current: false, description: "" }}
            addLabel="Add Experience"
            renderItem={(item, i, update) => (
              <>
                <FRow>
                  <F label="Job Title" value={item.title} onChange={(v) => update(i, "title", v)} placeholder="e.g. Software Engineer" />
                  <F label="Company" value={item.company} onChange={(v) => update(i, "company", v)} placeholder="e.g. Google" />
                </FRow>
                <FRow>
                  <F label="Location" value={item.location} onChange={(v) => update(i, "location", v)} placeholder="e.g. Bangalore" />
                  <div className="field" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
                    <input
                      type="checkbox"
                      checked={item.current || false}
                      onChange={(e) => update(i, "current", e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    <label style={{ margin: 0, fontSize: 13 }}>Currently working here</label>
                  </div>
                </FRow>
                <FRow>
                  <F label="Start Date" value={item.start_date} onChange={(v) => update(i, "start_date", v)} placeholder="e.g. Jan 2022" />
                  <F label="End Date" value={item.end_date} onChange={(v) => update(i, "end_date", v)} placeholder="e.g. Present" readOnly={item.current} />
                </FRow>
                <div className="field">
                  <label>Description</label>
                  <textarea
                    value={item.description || ""}
                    onChange={(e) => update(i, "description", e.target.value)}
                    rows={3}
                    placeholder="Key responsibilities and achievements…"
                  />
                </div>
              </>
            )}
          />
        </Section>

        {/* ── Skills ── */}
        <Section title="Skills" icon="⚡">
          <div className="field">
            <label>Your Skills</label>
            <ChipInput items={skills} onChange={setSkills} placeholder="Type a skill and press Enter" />
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>Add at least 3 skills for a better profile score.</p>
          </div>
        </Section>

        {/* ── Career Preferences ── */}
        <Section title="Career Preferences" icon="🎯">
          <FRow>
            <F label="Desired Role" value={desiredRole} onChange={setDesiredRole} placeholder="e.g. Senior Backend Engineer" />
            <F label="Job Type" value={jobType} onChange={setJobType} placeholder="full-time / part-time / contract / freelance" />
          </FRow>
          <div className="field">
            <label>Preferred Locations</label>
            <ChipInput items={prefLocations} onChange={setPrefLocations} placeholder="Type a location and press Enter" />
          </div>
          <FRow>
            <F label="Expected Salary (Min)" value={salaryMin} onChange={setSalaryMin} placeholder="e.g. 15,00,000" />
            <F label="Expected Salary (Max)" value={salaryMax} onChange={setSalaryMax} placeholder="e.g. 25,00,000" />
          </FRow>
          <div className="field">
            <label>Remote Preference</label>
            <select value={remotePref} onChange={(e) => setRemotePref(e.target.value)}>
              <option value="">Select…</option>
              <option value="remote">Fully Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </Section>

        {/* ── Save ── */}
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: "auto", padding: "12px 32px" }}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
          {saveMsg && <span style={{ fontSize: 14 }}>{saveMsg}</span>}
        </div>
      </div>
      <Footer />

      {/* ── Page-specific styles ── */}
      <style>{`
        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .profile-completion {
          flex-shrink: 0;
        }
        .profile-completion-bar {
          background: var(--line);
          border-radius: 4px;
          overflow: hidden;
        }
        .profile-section {
          background: var(--paper-2);
          border: 1px solid var(--line);
          border-radius: 14px;
          margin-bottom: 18px;
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .profile-section-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 22px;
          background: none;
          border: none;
          font: inherit;
          font-size: 16px;
          font-weight: 700;
          font-family: var(--display);
          color: var(--ink);
          cursor: pointer;
          transition: background 0.1s;
        }
        .profile-section-header:hover { background: var(--paper); }
        .profile-chevron { font-size: 18px; color: var(--ink-soft); }
        .profile-section-body { padding: 0 22px 22px; }
      `}</style>
    </>
  );
}
