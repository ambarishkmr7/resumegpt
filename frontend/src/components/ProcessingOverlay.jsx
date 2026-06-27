import { useEffect, useState } from "react";

const STEPS = [
  "Reading your document…",
  "Extracting content & structure…",
  "Parsing sections & bullet points…",
  "Mapping to resume fields…",
  "Finalising your resume…",
];

export default function ProcessingOverlay({ visible }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (!visible) { setStepIndex(0); setProgress(8); return; }

    const stepInterval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, 2200);

    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const jump = p < 40 ? 6 : p < 70 ? 4 : 1;
        return Math.min(p + jump, 90);
      });
    }, 400);

    return () => { clearInterval(stepInterval); clearInterval(progressInterval); };
  }, [visible]);

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Animated document icon */}
        <div style={styles.iconWrap}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={styles.docIcon}>
            <rect x="8" y="4" width="32" height="40" rx="4" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
            <rect x="8" y="4" width="32" height="40" rx="4" fill="url(#shimmer)" />
            <line x1="15" y1="18" x2="33" y2="18" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            <line x1="15" y1="25" x2="33" y2="25" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            <line x1="15" y1="32" x2="26" y2="32" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="100%" stopColor="transparent" />
                <animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="2 0" dur="1.6s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
          </svg>
          <div style={styles.sparkle1} />
          <div style={styles.sparkle2} />
          <div style={styles.sparkle3} />
        </div>

        <h2 style={styles.heading}>Processing Your Resume</h2>
        <p style={styles.step}>{STEPS[stepIndex]}</p>

        {/* Progress bar */}
        <div style={styles.trackWrap}>
          <div style={{ ...styles.track }}>
            <div style={{ ...styles.fill, width: `${progress}%` }} />
          </div>
          <span style={styles.pct}>{progress}%</span>
        </div>

        <p style={styles.hint}>This may take a few seconds — please don't close this tab.</p>
      </div>

      <style>{`
        @keyframes rgpo-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes rgpo-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        @keyframes rgpo-fadein {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rgpo-shimmer-fill {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(28, 26, 23, 0.72)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "44px 40px 36px",
    maxWidth: 420,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
    animation: "rgpo-fadein 0.35s ease",
  },
  iconWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  docIcon: {
    filter: "drop-shadow(0 4px 12px rgba(217,119,6,0.35))",
    animation: "rgpo-pulse 2s ease-in-out infinite",
  },
  sparkle1: {
    position: "absolute", top: -4, right: -6,
    width: 10, height: 10, borderRadius: "50%",
    background: "#f59e0b",
    animation: "rgpo-pulse 1.8s ease-in-out infinite",
    animationDelay: "0s",
  },
  sparkle2: {
    position: "absolute", bottom: 0, left: -8,
    width: 7, height: 7, borderRadius: "50%",
    background: "#d97706",
    animation: "rgpo-pulse 1.8s ease-in-out infinite",
    animationDelay: "0.6s",
  },
  sparkle3: {
    position: "absolute", top: 12, left: -10,
    width: 5, height: 5, borderRadius: "50%",
    background: "#b45309",
    animation: "rgpo-pulse 1.8s ease-in-out infinite",
    animationDelay: "1.2s",
  },
  heading: {
    margin: "0 0 8px",
    fontSize: 20,
    fontWeight: 800,
    color: "#1c1a17",
    fontFamily: "var(--display, sans-serif)",
  },
  step: {
    margin: "0 0 24px",
    fontSize: 14,
    color: "#b45309",
    fontWeight: 600,
    minHeight: 20,
    transition: "opacity 0.4s",
  },
  trackWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  track: {
    flex: 1,
    height: 8,
    background: "#fef3c7",
    borderRadius: 99,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 99,
    background: "linear-gradient(90deg, #f59e0b, #d97706, #b45309)",
    backgroundSize: "200% 100%",
    animation: "rgpo-shimmer-fill 1.8s linear infinite",
    transition: "width 0.5s ease",
  },
  pct: {
    fontSize: 12,
    fontWeight: 700,
    color: "#b45309",
    width: 34,
    textAlign: "right",
  },
  hint: {
    margin: 0,
    fontSize: 12,
    color: "#9c8c7a",
    lineHeight: 1.5,
  },
};
