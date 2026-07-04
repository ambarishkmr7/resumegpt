// Parse a `cms_sub` record's content into { price, features }.
//
// Expected shape (Markdown-ish, as stored in cms_pages):
//   **Elite Plan — ₹1,999 (One-time)**
//   • Feature one
//   • Feature two
//
// Used by both the homepage Elite plan box and the subscription popup so they
// stay in sync. Returns { price: "1,999"|null, features: string[] }.
export function parseSubscription(raw) {
  if (!raw) return { price: null, features: [] };
  const priceMatch = raw.match(/₹\s*([\d,]+)/);
  const features = raw
    .replace(/<[^>]+>/g, " ")
    .split(/\n/)
    .flatMap((l) => l.split("•"))
    .map((l) => l.replace(/^[\-\s]+/, "").replace(/\*\*/g, "").trim())
    .filter(
      (l) =>
        l.length > 2 &&
        !/^Elite Plan|^₹|one[\s-]?time|lifetime access|no recurring/i.test(l)
    );
  return { price: priceMatch ? priceMatch[1] : null, features };
}
