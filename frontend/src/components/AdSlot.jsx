/**
 * AdSlot — drop-in AdSense placeholder.
 *
 * Usage:
 *   <AdSlot slot="1234567890" format="vertical" />   // sidebar
 *   <AdSlot slot="1234567890" format="horizontal" />  // banner
 *   <AdSlot slot="1234567890" format="rectangle" />   // in-content box
 *
 * Before going live:
 *   1. Replace ADSENSE_CLIENT with your ca-pub-XXXXXXXXXXXXXXXX
 *   2. Replace each slot prop with your actual ad unit slot IDs
 *   3. Add <script> to index.html:
 *      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
 */

import { useEffect, useRef } from "react";

const ADSENSE_CLIENT = "ca-pub-XXXXXXXXXXXXXXXX"; // ← replace with your publisher ID

const SIZES = {
  vertical:   { width: 160, height: 600, label: "Vertical Ad (160×600)" },
  horizontal: { width: "100%", height: 90,  label: "Horizontal Banner (728×90)" },
  rectangle:  { width: 300,  height: 250, label: "Rectangle Ad (300×250)" },
};

export default function AdSlot({ slot = "0000000000", format = "vertical", style = {} }) {
  const adRef = useRef(null);

  useEffect(() => {
    try {
      if (window.adsbygoogle) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      // adsbygoogle not loaded yet — safe to ignore in dev
    }
  }, []);

  const size = SIZES[format] || SIZES.vertical;

  // Dev / pre-AdSense placeholder
  const isLive = ADSENSE_CLIENT !== "ca-pub-XXXXXXXXXXXXXXXX";

  if (!isLive) {
    return (
      <div style={{
        width: size.width,
        minHeight: size.height,
        background: "repeating-linear-gradient(45deg,#f3f0e8,#f3f0e8 10px,#ede9df 10px,#ede9df 20px)",
        border: "1.5px dashed #c8bfad",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: "#9c8f7e",
        fontSize: 12,
        textAlign: "center",
        padding: 8,
        flexShrink: 0,
        ...style,
      }}>
        <span style={{ fontSize: 20 }}>📢</span>
        <span style={{ fontWeight: 600 }}>Advertisement</span>
        <span style={{ opacity: 0.7 }}>{size.label}</span>
        <span style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>Replace publisher ID to go live</span>
      </div>
    );
  }

  return (
    <div style={{ width: size.width, minHeight: size.height, flexShrink: 0, ...style }}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", height: size.height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format === "vertical" ? "vertical" : "auto"}
        data-full-width-responsive="true"
      />
    </div>
  );
}
