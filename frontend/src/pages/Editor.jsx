import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
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
  const { user } = useAuth();

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
  const [subStatus, setSubStatus] = useState(null);
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
  // Mobile: which panel to show (edit | preview | ats | ai | elite)
  const [mobileView, setMobileView] = useState("edit");
  // Mobile toolbar overflow
  const [toolbarMore, setToolbarMore] = useState(false);
  const toolbarMoreRef = useRef();

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

    api.subscriptionStatus().then(setSubStatus).catch(() => {});

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

  // Close toolbar "more" dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (toolbarMoreRef.current && !toolbarMoreRef.current.contains(e.target)) {
        setToolbarMore(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
  const isEliteUnlocked = !!(subStatus?.is_subscribed && subStatus?.payment_id);

  const openEliteTab = () => {
    const isGuest = user?.email?.endsWith("@guest.resumesgpt.in");
    if (!user || isGuest) {
      navigate("/login");
      return;
    }
    if (isEliteUnlocked) {
      setRightTab("elite"); setMobileView("elite");
    } else {
      setShowSub(true);
    }
  };
  const isPdf = originalType.includes("pdf");

  return (
    <>
      <Topbar />
      <div className="container">
        <div className="toolbar">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>← Back</button>
          <input className="toolbar-title-input" style={{ fontWeight: 600 }} value={title}
            onChange={(e) => setTitle(e.target.value)} />
          <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>{status}</span>
          <div className="spacer" />

          {/* Primary actions — always visible */}
          <button className="btn btn-ghost btn-sm toolbar-mobile-hide" onClick={() => refFileRef.current.click()}>
            📎 Ref</button>
          <button className="btn btn-ghost btn-sm toolbar-mobile-hide" onClick={() => setShowCover(true)}>📝 Letter</button>
          <button className="btn btn-ghost btn-sm toolbar-mobile-hide" onClick={() => download("pdf")}>↓ PDF</button>
          <button className="btn btn-primary btn-sm toolbar-mobile-hide" style={{ width: "auto" }} onClick={() => download("docx")}>
            ↓ DOCX</button>

          {/* More dropdown — visible on tablet/mobile */}
          <div className="toolbar-more" ref={toolbarMoreRef}>
            <button className="btn btn-ghost btn-sm toolbar-more-btn" onClick={() => setToolbarMore(!toolbarMore)} type="button">
              ⋯ More
            </button>
            {toolbarMore && (
              <div className="toolbar-more-dropdown">
                <button className="toolbar-more-item" onClick={() => { refFileRef.current.click(); setToolbarMore(false); }} type="button">
                  📎 Reference résumé
                </button>
                <button className="toolbar-more-item" onClick={() => { setShowCover(true); setToolbarMore(false); }} type="button">
                  📝 Cover letter
                </button>
                <button className="toolbar-more-item" onClick={() => { openExternal("naukri"); setToolbarMore(false); }} type="button">
                  Update Naukri
                </button>
                <button className="toolbar-more-item" onClick={() => { openExternal("linkedin"); setToolbarMore(false); }} type="button">
                  Update LinkedIn
                </button>
                <div className="toolbar-more-sep" />
                <button className="toolbar-more-item" onClick={() => { download("pdf"); setToolbarMore(false); }} type="button">
                  ↓ Download PDF
                </button>
                <button className="toolbar-more-item" onClick={() => { download("docx"); setToolbarMore(false); }} type="button">
                  ↓ Download DOCX
                </button>
              </div>
            )}
          </div>

          <input ref={refFileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={onReference} />
        </div>

        {error && <div className="error">{error}</div>}

        {/* ── Mobile tab switcher (visible only on mobile) ── */}
        <div className="editor-mobile-tabs">
          <button className={`editor-mobile-tab ${mobileView === "edit" ? "active" : ""}`} onClick={() => { setMobileView("edit"); setLeftTab("edit"); }}>✏️ Edit</button>
          <button className={`editor-mobile-tab ${mobileView === "preview" ? "active" : ""}`} onClick={() => { setMobileView("preview"); setRightTab("preview"); }}>👁️ Preview</button>
          <button className={`editor-mobile-tab ${mobileView === "ats" ? "active" : ""}`} onClick={() => { setMobileView("ats"); setRightTab("ats"); }}>🎯 ATS</button>
          <button className={`editor-mobile-tab ${mobileView === "ai" ? "active" : ""}`} onClick={() => { setMobileView("ai"); setRightTab("ai"); }}>🤖 AI</button>
          <button className={`editor-mobile-tab ${mobileView === "elite" ? "active" : ""}`} onClick={openEliteTab}>✨ Elite</button>
        </div>

        <div className="editor-layout">
          {/* ── Left Ad Sidebar (hidden on mobile) ── */}
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
          <div className={`editor-form-col ${mobileView !== "edit" && mobileView !== "templates" ? "editor-col-hidden" : ""}`}>
            <div className="right-tabs" style={{ marginBottom: 14 }}>
              <button className={`rtab ${leftTab === "edit" ? "active" : ""}`}
                onClick={() => { setLeftTab("edit"); setMobileView("edit"); }}>Edit Resume</button>
              <button className={`rtab ${leftTab === "templates" ? "active" : ""}`}
                onClick={() => { setLeftTab("templates"); setMobileView("edit"); }}>Templates</button>
            </div>
            {leftTab === "templates" && (
              <TemplateSelector templates={templates} active={templateId} onSelect={setTemplateId} />
            )}
            {leftTab === "edit" && (
              <ResumeForm content={content} onChange={setContent} />
            )}
          </div>

          {/* ── Right panel (Preview / ATS / AI / Elite) ── */}
          <div className={`editor-right-col ${mobileView !== "preview" && mobileView !== "ats" && mobileView !== "ai" && mobileView !== "elite" ? "editor-col-hidden" : ""}`}>
            <div className="sticky">
              {/* Right-column tabs (hidden on mobile since we have mobile tabs above) */}
              <div className="right-tabs editor-desktop-tabs">
                <button className={`rtab ${rightTab === "preview" ? "active" : ""}`}
                  onClick={() => { setRightTab("preview"); setMobileView("preview"); }}>Preview</button>
                <button className={`rtab ${rightTab === "ats" ? "active" : ""}`}
                  onClick={() => { setRightTab("ats"); setMobileView("ats"); }}>ATS Score</button>
                <button className={`rtab ${rightTab === "ai" ? "active" : ""}`}
                  onClick={() => { setRightTab("ai"); setMobileView("ai"); }}>AI Tools</button>
                <button className={`rtab ${rightTab === "elite" ? "active" : ""}`}
                  onClick={openEliteTab}>✨ Elite</button>
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
              isEliteUnlocked
                ? <ElitePanel content={content} />
                : (
                  <div style={{ padding: "40px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Elite Plan Required</div>
                    <div style={{ color: "var(--ink-soft)", marginBottom: 20, fontSize: 14 }}>
                      Unlock AI Career Counseling, Mock Interviews, Job Agent, and more.
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowSub(true)}>
                      Upgrade to Elite — ₹1,999
                    </button>
                  </div>
                )
            )}
            </div>
          </div>
        </div>
      </div>

      {showCover && <CoverLetterModal content={content} onClose={() => setShowCover(false)} />}
      {showSub && <SubscriptionModal onClose={() => setShowSub(false)}
        onSuccess={() => {
          setShowSub(false);
          setStatus("Subscription activated!");
          api.subscriptionStatus().then(setSubStatus).catch(() => {});
        }} />}
    </>
  );
}
