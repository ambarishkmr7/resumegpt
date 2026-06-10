import { useState } from "react";
import { api } from "../api/client";

export default function WritingPanel({ content }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const analyze = async () => {
    setLoading(true); setError("");
    try { setResult(await api.writingAnalysis(content)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const scoreColor = (s) => s >= 85 ? "#15803d" : s >= 70 ? "#d97706" : s >= 50 ? "#ea580c" : "#dc2626";

  return (
    <div className="panel writing-panel">
      <h3>✍️ Writing Analysis</h3>
      <p className="panel-hint">
        AI-powered analysis of your resume's tone, semantic quality, and spelling accuracy.
      </p>

      <button className="btn btn-primary" onClick={analyze} disabled={loading} style={{ width: "100%" }}>
        {loading ? "Analyzing writing…" : "🔍 Analyze My Resume Writing"}
      </button>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div className="writing-results">
          {/* Overall Summary */}
          <div className="writing-summary">
            <div className="ws-score" style={{ color: scoreColor(result.overall_score) }}>
              {result.overall_score}/100
            </div>
            <p className="ws-text">{result.summary}</p>
          </div>

          {/* Tone Analysis */}
          <div className="writing-section">
            <div className="ws-header">
              <h4>🎯 Tone Analysis</h4>
              <span className="ws-badge" style={{ background: scoreColor(result.tone_score), color: "#fff" }}>
                {result.tone_score}/100 — {result.tone_label}
              </span>
            </div>

            {result.power_verbs_used?.length > 0 && (
              <div className="ws-subsection">
                <strong className="ai-good">✓ Power verbs used:</strong>
                <div className="ws-chips">
                  {result.power_verbs_used.map((v, i) => (
                    <span key={i} className="ws-chip good">{v}</span>
                  ))}
                </div>
              </div>
            )}

            {result.tone_issues?.filter(t => t.type === "passive").length > 0 && (
              <div className="ws-subsection">
                <strong className="ai-warn">⚠ Passive phrases found:</strong>
                <div className="ws-chips">
                  {result.tone_issues.filter(t => t.type === "passive").map((t, i) => (
                    <span key={i} className="ws-chip warn">"{t.phrase}" ×{t.count}</span>
                  ))}
                </div>
              </div>
            )}

            {result.tone_issues?.filter(t => t.type === "weak").length > 0 && (
              <div className="ws-subsection">
                <strong className="ai-warn">⚠ Weak language:</strong>
                <div className="ws-chips">
                  {result.tone_issues.filter(t => t.type === "weak").map((t, i) => (
                    <span key={i} className="ws-chip warn">"{t.phrase}" ×{t.count}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Semantic Analysis */}
          {result.semantic_issues?.length > 0 && (
            <div className="writing-section">
              <h4>📝 Semantic Issues</h4>
              {result.semantic_issues.map((issue, i) => (
                <div key={i} className={`ws-issue ${issue.severity}`}>
                  <div className="ws-issue-head">
                    <span className={`ws-severity ${issue.severity}`}>
                      {issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"} {issue.severity}
                    </span>
                    <span className="ws-found">Found: "{issue.found}"</span>
                  </div>
                  <p className="ws-suggestion">💡 {issue.suggestion}</p>
                </div>
              ))}
            </div>
          )}

          {/* Metrics Ratio */}
          {result.metric_ratio && (
            <div className="writing-section">
              <h4>📊 Quantification</h4>
              <p>
                <strong>{result.metric_ratio}</strong> of your bullet points include numbers or metrics.
                {parseInt(result.metric_ratio) < 50
                  ? " Aim for at least 50% — numbers make your impact concrete and memorable."
                  : " Good job including quantifiable results!"}
              </p>
            </div>
          )}

          {/* Spelling Issues */}
          {result.spelling_issues?.length > 0 && (
            <div className="writing-section">
              <h4>🔤 Spelling Issues</h4>
              <div className="ws-spelling-list">
                {result.spelling_issues.map((s, i) => (
                  <div key={i} className="ws-spelling">
                    <span className="ws-wrong">{s.wrong}</span>
                    <span className="ws-arrow">→</span>
                    <span className="ws-correct">{s.correct}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grammar Issues */}
          {result.grammar_issues?.length > 0 && (
            <div className="writing-section">
              <h4>📐 Grammar Issues</h4>
              <ul>
                {result.grammar_issues.map((g, i) => <li key={i} className="ai-warn">{g}</li>)}
              </ul>
            </div>
          )}

          {result.semantic_issues?.length === 0 && result.spelling_issues?.length === 0 &&
           result.grammar_issues?.length === 0 && (
            <div className="ws-allclear">
              ✅ No semantic, spelling, or grammar issues detected. Your writing looks clean!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
