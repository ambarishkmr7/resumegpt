// Usage meters shown in the topbar dropdown, the chatbot header, and
// Settings → Usage. Interview minutes are shown as "X min left" (matching the
// interview page); AI usage is percent-only (Claude-style — no raw token
// counts on the user side).
import { useEffect, useState } from "react";
import { api } from "../api/client";

function barColor(pct) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#22c55e";
}

function Bar({ label, pct, valueLabel, subLabel, vertical }) {
  const used = Math.min(100, Math.max(0, Math.round(pct ?? 0)));
  return (
    <div style={{ minWidth: vertical ? undefined : 160, flex: vertical ? undefined : 1, width: vertical ? "100%" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "var(--ink-soft,#57514a)" }}>{label}</span>
        <span style={{ fontWeight: 700, color: barColor(used), whiteSpace: "nowrap" }}>{valueLabel}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--line,#e2dccf)", overflow: "hidden" }}>
        <div style={{ width: `${used}%`, height: "100%", background: barColor(used), transition: "width 0.4s ease" }} />
      </div>
      {subLabel && (
        <div style={{ fontSize: 11, color: "var(--ink-soft,#57514a)", marginTop: 2 }}>{subLabel}</div>
      )}
    </div>
  );
}

export default function UsageMeter({ compact = false, vertical = false, showResumeQuota = true, style = {} }) {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let live = true;
    api.usageSummary().then((u) => { if (live) setUsage(u); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!usage) return null;

  const tokens = usage.tokens || {};
  const uploads = usage.resume_uploads || {};

  return (
    <div
      className="usage-meter"
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        gap: vertical ? 14 : compact ? 14 : 22,
        flexWrap: vertical ? "nowrap" : "wrap",
        alignItems: vertical ? "stretch" : "flex-start",
        padding: compact ? "8px 12px" : "14px 18px",
        background: "var(--paper-2,#fffdf8)", border: "1px solid var(--line,#e2dccf)",
        borderRadius: 12, ...style,
      }}
    >
      <Bar
        label="🎙 Interview minutes"
        pct={usage.percent_used}
        valueLabel={`${usage.available_minutes ?? 0} min left`}
        vertical={vertical}
      />
      <Bar
        label="🤖 AI usage"
        pct={tokens.percent_used}
        valueLabel={`${Math.round(tokens.percent_used ?? 0)}% used`}
        subLabel={`💬 Chat: ${Math.round(tokens.chat_percent_used ?? 0)}% of monthly AI usage`}
        vertical={vertical}
      />
      {showResumeQuota && uploads.daily_limit > 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-soft,#57514a)", alignSelf: vertical ? "flex-start" : "center" }}>
          📄 Resumes today: <strong>{uploads.used_today}/{uploads.daily_limit}</strong>
        </div>
      )}
      {!compact && usage.cycle_end && (
        <div style={{ fontSize: 12, color: "var(--ink-soft,#57514a)", alignSelf: vertical ? "flex-start" : "center" }}>
          Resets {new Date(usage.cycle_end).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
