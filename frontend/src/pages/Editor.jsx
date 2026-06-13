import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import Topbar from "../components/Topbar.jsx";
import ResumeForm from "../components/ResumeForm.jsx";
import ResumePreview from "../components/ResumePreview.jsx";
import TemplateSelector from "../components/TemplateSelector.jsx";
import ATSPanel from "../components/ATSPanel.jsx";
import AIToolsPanel from "../components/AIToolsPanel.jsx";
import ElitePanel from "../components/ElitePanel.jsx";
import CoverLetterModal from "../components/CoverLetterModal.jsx";
import SubscriptionModal from "../components/SubscriptionModal.jsx";
import { SkeletonBlock, SkeletonLine } from "../components/Skeleton.jsx";

function EditorSkeleton() {
  return (
    <>
      <Topbar />
      <div className="container">
        {/* Toolbar skeleton — matches .toolbar flex layout */}
        <div className="toolbar">
          <SkeletonBlock width={80} height={34} borderRadius={6} />
          <SkeletonBlock width={220} height={34} borderRadius={6} />
          <SkeletonBlock width={100} height={14} borderRadius={4} />
          <div className="spacer" />
          <SkeletonBlock width={100} height={34} borderRadius={6} />
          <SkeletonBlock width={110} height={34} borderRadius={6} />
          <SkeletonBlock width={100} height={34} borderRadius={6} />
          <SkeletonBlock width={100} height={34} borderRadius={6} />
          <SkeletonBlock width={60} height={34} borderRadius={6} />
          <SkeletonBlock width={80} height={34} borderRadius={6} />
        </div>

        {/* Editor layout — matches .editor-layout grid: 160px minmax(0,340px) 1fr */}
        <div className="editor-layout">

          {/* Left ad sidebar — 160px */}
          <aside className="editor-ad-sidebar">
            {[1, 2].map((i) => (
              <div key={i} className="ad-slot" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 14 }}>
                <SkeletonBlock width={60} height={12} borderRadius={4} />
                <SkeletonBlock width={44} height={44} borderRadius={10} />
                <SkeletonLine width="85%" height={14} />
                <SkeletonLine width="100%" height={11} />
                <SkeletonBlock width="70%" height={24} borderRadius={6} style={{ marginTop: 4 }} />
              </div>
            ))}
          </aside>

          {/* Middle form area — minmax(0, 340px) */}
          <div>
            {/* Tab switcher: Edit Resume / Templates */}
            <div className="right-tabs" style={{ marginBottom: 14 }}>
              <SkeletonBlock width={110} height={34} borderRadius={8} />
              <SkeletonBlock width={110} height={34} borderRadius={8} />
            </div>
            {/* Form field skeletons — match ResumeForm layout */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <SkeletonLine width={90 + (i % 3) * 20} height={13} style={{ marginBottom: 6 }} />
                {i === 3 || i === 6 ? (
                  <SkeletonBlock width="100%" height={80} borderRadius={8} />
                ) : (
                  <SkeletonBlock width="100%" height={42} borderRadius={8} />
                )}
              </div>
            ))}
          </div>

          {/* Right sticky panel — 1fr */}
          <div className="sticky">
            {/* Right-column tabs: Preview / ATS / AI / Career / Elite */}
            <div className="right-tabs">
              <SkeletonBlock width={70} height={32} borderRadius={8} />
              <SkeletonBlock width={80} height={32} borderRadius={8} />
              <SkeletonBlock width={70} height={32} borderRadius={8} />
              <SkeletonBlock width={65} height={32} borderRadius={8} />
              <SkeletonBlock width={60} height={32} borderRadius={8} />
            </div>
            {/* Preview area — large block simulating resume preview */}
            <div style={{ marginTop: 14, background: "#fff", border: "1px solid #e2dccf", borderRadius: 10, padding: 20, minHeight: 520 }}>
              {/* Simulate resume header */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <SkeletonBlock width="40%" height={22} borderRadius={4} />
                <SkeletonBlock width="60%" height={14} borderRadius={4} />
                <SkeletonBlock width="50%" height={12} borderRadius={4} />
              </div>
              {/* Simulate resume sections */}
              {[1, 2, 3, 4].map((section) => (
                <div key={section} style={{ marginBottom: 18 }}>
                  <SkeletonBlock width="35%" height={16} borderRadius={4} style={{ marginBottom: 10 }} />
                  {[1, 2, 3].map((line) => (
                    <SkeletonLine key={line} width={line === 3 ? "65%" : "100%"} height={12} style={{ marginBottom: 6 }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("classic");
  const [content, setContent] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [ats, setAts] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState("");
  const [scoring, setScoring] = useState(false);
  const [improving, setImproving] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [error, setError] = useState("");

  // Original-file preview
  const [viewMode, setViewMode] = useState("enhanced");
  const [originalUrl, setOriginalUrl] = useState(null);
  const [originalType, setOriginalType] = useState("");
  const [hasOriginal, setHasOriginal] = useState(false);

  // Right panel tab
  const [rightTab, setRightTab] = useState("preview");
  // Left panel tab
  const [leftTab, setLeftTab] = useState("edit");

  const saveTimer = useRef();
  const atsTimer = useRef();
  const refFileRef = useRef();
  const firstLoad = useRef(true);

  useEffect(() => {
    Promise.all([api.getResume(id), api.templates()])
      .then(([r, tpls]) => {
        setTitle(r.title); setTemplateId(r.template_id);
        setContent(r.content); setTemplates(tpls);
      })
      .catch((e) => setError(e.message));

    api.fetchOriginal(id).then((result) => {
      if (result) {
        setOriginalUrl(URL.createObjectURL(result.blob));
        setOriginalType(result.type);
        setHasOriginal(true);
      }
    });
    return () => setOriginalUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, [id]);

  useEffect(() => {
    if (content && firstLoad.current) { firstLoad.current = false; rescore(content, ""); }
  }, [content]);

  // Debounced auto-save
  useEffect(() => {
    if (!content) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("Saving…");
      try {
        await api.updateResume(id, { title, template_id: templateId, content });
        setStatus("Saved"); setTimeout(() => setStatus(""), 1200);
      } catch { setStatus("Save failed"); }
    }, 900);
    return () => clearTimeout(saveTimer.current);
  }, [title, templateId, content, id]);

  useEffect(() => {
    if (!content || firstLoad.current) return;
    clearTimeout(atsTimer.current);
    atsTimer.current = setTimeout(() => rescore(content, jobDescription), 1100);
    return () => clearTimeout(atsTimer.current);
  }, [content]);

  const rescore = async (c, jd) => {
    setScoring(true);
    try { setAts(await api.ats(c, jd || null)); } catch (e) { setError(e.message); }
    finally { setScoring(false); }
  };

  const download = async (fmt) => {
    try {
      const result = await api.download(id, fmt);
      if (result.needsSub) { setShowSub(true); return; }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(title || "resume").replace(/\s+/g, "_")}.${fmt}`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const improve = async () => {
    setImproving(true); setError("");
    try {
      const res = await api.suggest(content, jobDescription || null);
      setContent(res.improved_content);
      setStatus(res.notes?.[0] || "Applied suggestions");
      rescore(res.improved_content, jobDescription);
    } catch (e) { setError(e.message); }
    finally { setImproving(false); }
  };

  const onReference = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStatus("Parsing reference…");
    try {
      const ref = await api.parseReference(file);
      const merge = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));
      setContent({ ...content, skills: merge(content.skills, ref.skills),
        certifications: merge(content.certifications, ref.certifications),
        languages: merge(content.languages, ref.languages) });
      setStatus(`Pulled ${ref.skills?.length || 0} skills from reference`);
    } catch (err) { setError(err.message); }
    finally { e.target.value = ""; }
  };

  const openExternal = (platform) => {
    const urls = {
      naukri: "https://www.naukri.com/mnjuser/profile?id=&altresid=",
      linkedin: "https://www.linkedin.com/in/me/edit/",
    };
    window.open(urls[platform], "_blank", "noopener");
  };

  if (error && !content) return <><Topbar /><div className="container"><div className="error">{error}</div></div></>;
  if (!content) return <EditorSkeleton />;

  const activeTpl = templates.find((t) => t.id === templateId) || null;
  const isPdf = originalType.includes("pdf");

  return (
    <>
      <Topbar />
      <div className="container">
        <div className="toolbar">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>← Back</button>
          <input style={{ width: 220, fontWeight: 600 }} value={title}
            onChange={(e) => setTitle(e.target.value)} />
          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>{status}</span>
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => refFileRef.current.click()}>
            📎 Reference résumé</button>
          {/* AI Improve hidden */}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCover(true)}>📝 Cover letter</button>
          <button className="btn btn-ghost btn-sm" onClick={() => openExternal("naukri")}>
            Update Naukri</button>
          <button className="btn btn-ghost btn-sm" onClick={() => openExternal("linkedin")}>
            Update LinkedIn</button>
          <button className="btn btn-ghost btn-sm" onClick={() => download("pdf")}>↓ PDF</button>
          <button className="btn btn-primary btn-sm" style={{ width: "auto" }} onClick={() => download("docx")}>
            ↓ DOCX</button>
          <input ref={refFileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={onReference} />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="editor-layout">
          {/* ── Left Ad Sidebar ── */}
          <aside className="editor-ad-sidebar">
            <div className="ad-slot" onClick={() => window.open("https://www.naukri.com", "_blank")}>
              <div className="ad-slot-label">Sponsored</div>
              <div className="ad-slot-icon">💼</div>
              <div className="ad-slot-title">Find Jobs</div>
              <div className="ad-slot-sub">Naukri · LinkedIn · Indeed · RemoteJobs</div>
              <div className="ad-slot-cta">Browse Now →</div>
            </div>
            <div className="ad-slot" onClick={() => window.open("https://www.coursera.org", "_blank")}>
              <div className="ad-slot-label">Sponsored</div>
              <div className="ad-slot-icon">🎓</div>
              <div className="ad-slot-title">Upskill Fast</div>
              <div className="ad-slot-sub">Coursera · Internshala · Top certifications</div>
              <div className="ad-slot-cta">Start Free →</div>
            </div>
          </aside>

          {/* ── Edit / Templates column ── */}
          <div>
            <div className="right-tabs" style={{ marginBottom: 14 }}>
              <button className={`rtab ${leftTab === "edit" ? "active" : ""}`}
                onClick={() => setLeftTab("edit")}>Edit Resume</button>
              <button className={`rtab ${leftTab === "templates" ? "active" : ""}`}
                onClick={() => setLeftTab("templates")}>Templates</button>
            </div>
            {leftTab === "templates" && (
              <TemplateSelector templates={templates} active={templateId} onSelect={setTemplateId} />
            )}
            {leftTab === "edit" && (
              <ResumeForm content={content} onChange={setContent} />
            )}
          </div>
          <div className="sticky">
            {/* Right-column tabs */}
            <div className="right-tabs">
              <button className={`rtab ${rightTab === "preview" ? "active" : ""}`}
                onClick={() => setRightTab("preview")}>Preview</button>
              <button className={`rtab ${rightTab === "ats" ? "active" : ""}`}
                onClick={() => setRightTab("ats")}>ATS Score</button>
              <button className={`rtab ${rightTab === "ai" ? "active" : ""}`}
                onClick={() => setRightTab("ai")}>AI Tools</button>
              <button className={`rtab ${rightTab === "elite" ? "active" : ""}`}
                onClick={() => setRightTab("elite")}>✨ Elite</button>
            </div>

            {rightTab === "preview" && (
              <>
                {hasOriginal && (
                  <div className="view-toggle">
                    <button className={`toggle-btn ${viewMode === "original" ? "active" : ""}`}
                      onClick={() => setViewMode("original")}>Original (as uploaded)</button>
                    <button className={`toggle-btn ${viewMode === "enhanced" ? "active" : ""}`}
                      onClick={() => setViewMode("enhanced")}>Enhanced preview</button>
                  </div>
                )}
                {viewMode === "original" && originalUrl ? (
                  <div className="original-preview">
                    {isPdf ? (
                      <iframe src={originalUrl} title="Original resume" className="original-iframe" />
                    ) : (
                      <div className="original-docx-notice">
                        <p>📄 Your original DOCX file has been parsed and all content is loaded in the editor.</p>
                        <p style={{fontSize:12}}>DOCX files cannot be previewed inline in the browser. Switch to "Enhanced preview" to see your styled resume, or download the original below.</p>
                        <a href={originalUrl} download={title || "resume"} className="btn btn-ghost btn-sm" style={{marginTop:8}}>
                          ↓ Download original file</a>
                      </div>
                    )}
                  </div>
                ) : (
                  <ResumePreview content={content} template={activeTpl} />
                )}
              </>
            )}

            {rightTab === "ats" && (
              <ATSPanel result={ats} jobDescription={jobDescription}
                onJobDescriptionChange={setJobDescription}
                onRescore={() => rescore(content, jobDescription)} busy={scoring} />
            )}

            {rightTab === "ai" && (
              <AIToolsPanel content={content} resumeId={id}
                onApplyVariant={(v) => { setContent(v); setStatus("Applied variant"); }} />
            )}

            {rightTab === "elite" && (
              <ElitePanel content={content} />
            )}
          </div>
        </div>
      </div>

      {showCover && <CoverLetterModal content={content} onClose={() => setShowCover(false)} />}
      {showSub && <SubscriptionModal onClose={() => setShowSub(false)}
        onSuccess={() => { setShowSub(false); setStatus("Subscription activated! You can now download."); }} />}
    </>
  );
}
