import { useState, useEffect, useRef } from "react";

const ADS = [
  {
    src: "/marketforesight.png",
    href: "http://market-foresight.com",
    alt: "Market Foresight – AI-Powered Market Intelligence",
  },
  {
    src: "/compareanycontent.png",
    href: "https://compareanycontent.com/",
    alt: "Compare Any Content – Fast, Accurate, Reliable",
  },
  {
    src: "/fileforge.png",
    href: "https://files-forge.com/",
    alt: "Files-Forge – All-in-One File Converter",
  },
];

const INTERVAL_MS = 4500;

export default function AdCarousel({ width = 160 }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const timerRef = useRef(null);

  const goTo = (idx) => {
    setCurrent(idx);
    setAnimKey((k) => k + 1);
  };
  const next = () => goTo((current + 1) % ADS.length);
  const prev = () => goTo((current - 1 + ADS.length) % ADS.length);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(next, INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [paused, current]);

  return (
    <div
      style={{ width, flexShrink: 0, position: "relative", userSelect: "none" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Ad image with fade-in on change */}
      <a
        key={animKey}
        href={ADS[current].href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ADS[current].alt}
        style={{ display: "block", animation: "adFadeIn 0.45s ease" }}
      >
        <img
          src={ADS[current].src}
          alt={ADS[current].alt}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            cursor: "pointer",
          }}
        />
      </a>

      {/* Prev arrow */}
      <button onClick={(e) => { e.preventDefault(); prev(); }} style={arrowBtn("left")} aria-label="Previous ad">
        ‹
      </button>

      {/* Next arrow */}
      <button onClick={(e) => { e.preventDefault(); next(); }} style={arrowBtn("right")} aria-label="Next ad">
        ›
      </button>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 8 }}>
        {ADS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Show ad ${i + 1}`}
            style={{
              width: i === current ? 18 : 7,
              height: 7,
              borderRadius: 4,
              background: i === current ? "#b45309" : "#c8bfad",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.35s ease, background 0.35s ease",
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes adFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function arrowBtn(side) {
  return {
    position: "absolute",
    top: "50%",
    [side]: 4,
    transform: "translateY(-50%)",
    background: "rgba(28,26,23,0.50)",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
    zIndex: 2,
    transition: "background 0.2s",
  };
}
