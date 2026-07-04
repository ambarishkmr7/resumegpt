import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE, resolveSeo, canonicalFor, absoluteUrl } from "../seo/seoConfig.js";

// Dependency-free document-head manager. Drop a single <Seo /> inside the
// router and it updates title/meta/canonical/OG/Twitter/JSON-LD on every route
// change. Pages can override by passing title/description/jsonLd props.
//
// All tags Seo manages carry data-seo so they can be cleanly replaced without
// touching tags that were prerendered or hand-authored in index.html.

function upsertMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"][data-seo]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute("data-seo", "");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"][data-seo]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("data-seo", "");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(blocks) {
  document.head
    .querySelectorAll('script[type="application/ld+json"][data-seo]')
    .forEach((n) => n.remove());
  (blocks || []).forEach((obj) => {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-seo", "");
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  });
}

export default function Seo({ title, description, jsonLd, robots, image } = {}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = resolveSeo(pathname);
    const t = title || seo.title || SITE.defaultTitle;
    const d = description || seo.description || SITE.defaultDescription;
    const canonical = canonicalFor(pathname);
    const ogImage = absoluteUrl(image || SITE.ogImage);
    const robotsVal = robots || seo.robots || "index,follow";

    document.title = t;
    upsertMeta("name", "description", d);
    upsertMeta("name", "robots", robotsVal);
    upsertLink("canonical", canonical);

    // Open Graph
    upsertMeta("property", "og:title", t);
    upsertMeta("property", "og:description", d);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:site_name", SITE.name);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:locale", SITE.locale);

    // Twitter
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", t);
    upsertMeta("name", "twitter:description", d);
    upsertMeta("name", "twitter:image", ogImage);

    setJsonLd(jsonLd || seo.jsonLd);
  }, [pathname, title, description, jsonLd, robots, image]);

  return null;
}
