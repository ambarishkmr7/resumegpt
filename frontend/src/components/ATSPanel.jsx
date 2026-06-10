import { useState } from "react";

export default function ATSPanel({ result, jobDescription, onJobDescriptionChange, onRescore, busy }) {
  const [showJD, setShowJD] = useState(false);
  const score = result?.score ?? 0;

  return (
    <div className="panel">
      <h3>
        ATS score
        <button className="btn btn-ghost btn-sm" onClick={onRescore} disabled={busy}>
          {busy ? "Scoring…" : "Re-score"}
        </button>
      </h3>

      <div className="score-ring">
        <div className="ring" style={{ "--val": score }}>
          <div className="inner">{score}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>
            {score >= 85 ? "Strong" : score >= 60 ? "Needs work" : "Weak"}
          </div>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            Out of 100. Fix the items below to climb toward 100.
          </div>
        </div>
      </div>

      <button className="link-btn" onClick={() => setShowJD((s) => !s)}>
        {showJD ? "Hide" : "+ Add"} job description for keyword match
      </button>
      {showJD && (
        <div className="field" style={{ marginTop: 8 }}>
          <textarea
            rows={4}
            placeholder="Paste the job description to score keyword coverage…"
            value={jobDescription}
            onChange={(e) => onJobDescriptionChange(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={onRescore} disabled={busy}>
            Score against this job
          </button>
        </div>
      )}

      {result?.breakdown && (
        <div style={{ margin: "14px 0" }}>
          {Object.entries(result.breakdown).map(([k, v]) => (
            <div className="bd-row" key={k}>
              <span>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {result?.missing_keywords?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label>Missing keywords</label>
          <div className="chips">
            {result.missing_keywords.map((k, i) => (
              <span className="chip" key={i} style={{ background: "#fbeed5", color: "var(--warn)" }}>
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <label>Suggestions to reach 100%</label>
        {result?.issues?.length ? (
          result.issues.map((it, i) => (
            <div className="issue" key={i}>
              <div className="msg">
                <span className={`sev ${it.severity}`}>{it.severity}</span>
                {it.message}
              </div>
              <div className="sug">{it.suggestion}</div>
            </div>
          ))
        ) : (
          <p style={{ color: "var(--good)" }}>No issues found — your résumé looks great!</p>
        )}
      </div>
    </div>
  );
}
