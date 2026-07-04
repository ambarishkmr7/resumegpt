#!/usr/bin/env node
/**
 * Post-build prerender for public routes.
 *
 * Vite ships a single client-rendered index.html, which means crawlers (and
 * corporate URL classifiers) that don't execute JS see an empty <div id="root">
 * with generic meta. This script reads the built shell and writes a static
 * index.html per public route with:
 *   - the correct <title>, description, canonical, robots, Open Graph/Twitter
 *   - JSON-LD structured data for that route
 *   - a small, crawlable fallback <body> (replaced by React once JS loads)
 *
 * No headless browser and no extra dependencies — it injects from the shared
 * seoConfig, so runtime <Seo> and the prerendered HTML stay in sync.
 *
 * Wired into `npm run build` (vite build && node scripts/prerender.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SITE,
  PRERENDER_ROUTES,
  resolveSeo,
  canonicalFor,
  absoluteUrl,
} from "../src/seo/seoConfig.js";
import { BLOG_POSTS } from "../src/data/blogPosts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const SHELL_PATH = join(DIST, "index.html");

if (!existsSync(SHELL_PATH)) {
  console.error(`[prerender] dist/index.html not found — run "vite build" first.`);
  process.exit(1);
}
const shell = readFileSync(SHELL_PATH, "utf8");

const escAttr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Prevent a literal </script> inside JSON-LD from breaking the tag.
const escLd = (json) => json.replace(/</g, "\\u003c");

// Footer nav reused in every fallback body so crawlers discover public pages.
const NAV_LINKS = [
  ["/", "Home"],
  ["/page/about-us", "About"],
  ["/page/blog", "Blog"],
  ["/page/faq", "FAQ"],
  ["/page/contact-us", "Contact"],
  ["/register", "Sign up"],
  ["/login", "Login"],
  ["/page/privacy-policy", "Privacy"],
  ["/page/terms-of-service", "Terms"],
];

function headTags(seo) {
  const canonical = canonicalFor(seo.path);
  const img = absoluteUrl(SITE.ogImage);
  const robots = seo.robots || "index,follow";
  const t = seo.title;
  const d = seo.description;

  const lines = [
    `<meta name="description" content="${escAttr(d)}" data-seo>`,
    `<meta name="robots" content="${robots}" data-seo>`,
    `<link rel="canonical" href="${canonical}" data-seo>`,
    `<meta property="og:title" content="${escAttr(t)}" data-seo>`,
    `<meta property="og:description" content="${escAttr(d)}" data-seo>`,
    `<meta property="og:type" content="website" data-seo>`,
    `<meta property="og:url" content="${canonical}" data-seo>`,
    `<meta property="og:site_name" content="${escAttr(SITE.name)}" data-seo>`,
    `<meta property="og:image" content="${img}" data-seo>`,
    `<meta property="og:locale" content="${SITE.locale}" data-seo>`,
    `<meta name="twitter:card" content="summary_large_image" data-seo>`,
    `<meta name="twitter:title" content="${escAttr(t)}" data-seo>`,
    `<meta name="twitter:description" content="${escAttr(d)}" data-seo>`,
    `<meta name="twitter:image" content="${img}" data-seo>`,
  ];
  for (const ld of seo.jsonLd || []) {
    lines.push(
      `<script type="application/ld+json" data-seo>${escLd(JSON.stringify(ld))}</script>`
    );
  }
  return lines.join("\n    ");
}

function fallbackBody(seo) {
  const nav = NAV_LINKS.map(([href, label]) => `<a href="${href}">${escHtml(label)}</a>`).join(
    " · "
  );
  return (
    `<div id="seo-prerender" style="max-width:760px;margin:0 auto;padding:40px 24px;font-family:system-ui,sans-serif">` +
    `<h1>${escHtml(seo.body?.h1 || seo.title)}</h1>` +
    `<p>${escHtml(seo.body?.intro || seo.description)}</p>` +
    `<nav aria-label="Site">${nav}</nav>` +
    `<noscript><p>This site works best with JavaScript enabled.</p></noscript>` +
    `</div>`
  );
}

function buildHtml(seo) {
  let html = shell;
  // Replace the shell <title> (don't add a second one).
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escAttr(seo.title)}</title>`);
  // Inject SEO tags just before </head>.
  html = html.replace(/<\/head>/i, `    ${headTags(seo)}\n  </head>`);
  // Insert the crawlable fallback into #root (React replaces it on load).
  html = html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${fallbackBody(seo)}</div>`);
  return html;
}

// Blog posts aren't in seoConfig ROUTES (they have their own dataset), so build
// their SEO here: per-post title, description, Article JSON-LD, fallback body.
function isoDate(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

const BLOG_EXTRA = BLOG_POSTS.map((p) => {
  const path = `/blog/${p.slug}`;
  const published = isoDate(p.date);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.excerpt,
    ...(published ? { datePublished: published, dateModified: published } : {}),
    author: { "@type": "Organization", name: SITE.name },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: { "@type": "ImageObject", url: absoluteUrl(SITE.ogImage) },
    },
    mainEntityOfPage: canonicalFor(path),
    ...(p.keyword ? { keywords: p.keyword } : {}),
    ...(p.tag ? { articleSection: p.tag } : {}),
  };
  return {
    path,
    title: `${p.title} | resumes-gpt Blog`,
    description: p.excerpt,
    jsonLd: [articleLd],
    body: { h1: p.title, intro: p.excerpt },
  };
});

// Routes from seoConfig resolve through resolveSeo; blog entries are ready-made.
const ALL_SEO = [...PRERENDER_ROUTES.map(resolveSeo), ...BLOG_EXTRA];

let count = 0;
for (const seo of ALL_SEO) {
  const route = seo.path;
  const html = buildHtml(seo);
  const outDir = route === "/" ? DIST : join(DIST, route.replace(/^\//, ""));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html, "utf8");
  count++;
  console.log(`[prerender] ${route} -> ${join(outDir, "index.html").replace(DIST, "dist")}`);
}
console.log(`[prerender] wrote ${count} route(s).`);
