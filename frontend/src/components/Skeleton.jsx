/**
 * Reusable skeleton loading primitives.
 * Uses the same shimmer animation already established in the codebase.
 */

const shimmer = `
@keyframes sk-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

function baseStyle(overrides = {}) {
  return {
    background: "linear-gradient(90deg, #f0ece4 25%, #e8e4db 50%, #f0ece4 75%)",
    backgroundSize: "200% 100%",
    animation: "sk-shimmer 1.5s infinite",
    ...overrides,
  };
}

/** Generic rectangular block */
export function SkeletonBlock({ width = "100%", height = "18px", borderRadius = "6px", style }) {
  return <div style={baseStyle({ width, height, borderRadius, ...style })} />;
}

/** Text line -- use width to vary: "100%" | "70%" | "40%" */
export function SkeletonLine({ width = "100%", height = "16px", style }) {
  return <div style={baseStyle({ width, height, borderRadius: "6px", ...style })} />;
}

/** Circle -- for avatars, score rings, icons */
export function SkeletonCircle({ size = 36, style }) {
  return <div style={baseStyle({ width: size, height: size, borderRadius: "50%", flexShrink: 0, ...style })} />;
}

/** Card placeholder -- stacked lines inside a card */
export function SkeletonCard({ rows = 3, style }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2dccf", borderRadius: 12,
      padding: 16, display: "flex", flexDirection: "column", gap: 10, ...style,
    }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i === rows - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

/** Button placeholder */
export function SkeletonButton({ width = 100, height = 36, style }) {
  return <div style={baseStyle({ width, height, borderRadius: 8, ...style })} />;
}

/** Table row placeholder */
export function SkeletonTableRow({ columns = 3, style }) {
  return (
    <tr style={style}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: "10px 12px" }}>
          <SkeletonLine width={i === 0 ? "80%" : "60%"} />
        </td>
      ))}
    </tr>
  );
}

/** Inject the keyframe style once into the document */
export function SkeletonStyles() {
  return <style>{shimmer}</style>;
}
