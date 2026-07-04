// Single source of truth for SEO metadata.
// Pure ESM data + helpers — NO React/browser APIs — so it can be imported by
// both the React <Seo> component (runtime) and scripts/prerender.mjs (build).
import { TEMPLATE_META } from "../data/resumeTemplates.js";

export const SITE = {
  name: "resumes-gpt",
  legalName: "resumes-gpt",
  url: "https://www.resumes-gpt.com",
  defaultTitle: "resumes-gpt — Free AI Resume Builder & ATS Checker (India)",
  defaultDescription:
    "resumes-gpt is India's AI-powered resume builder. Create ATS-friendly resumes from 30+ templates, check your ATS score, generate cover letters, and get AI career tools — free to start.",
  twitter: "@resumesgpt",
  ogImage: "/logo.png", // resolved to an absolute URL at build/runtime
  locale: "en_IN",
};

// Absolute canonical URL for a path ("/" -> site root, no trailing slash dupes).
export function canonicalFor(pathname) {
  if (!pathname || pathname === "/") return SITE.url + "/";
  return SITE.url + (pathname.startsWith("/") ? pathname : "/" + pathname);
}

export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return SITE.url;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return SITE.url + (pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl);
}

// ── Reusable JSON-LD blocks ───────────────────────────────────────────────
function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: absoluteUrl(SITE.ogImage),
    description: SITE.defaultDescription,
    knowsAbout: ["Resume writing", "ATS optimization", "Job search", "Career development", "Cover letters"],
    sameAs: [],
  };
}

function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    about: "AI resume builder, ATS checker, and career tools",
    keywords: "resume builder, ATS checker, cover letter, job search, career",
  };
}

function softwareApplicationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "resumes-gpt — AI Resume Builder",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Resume Builder / Career Tools",
    operatingSystem: "Web",
    url: SITE.url,
    description: SITE.defaultDescription,
    isAccessibleForFree: true,
    keywords: "AI resume builder, ATS checker, cover letter, job search, career tools",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      description: "Free to build and preview resumes. Elite plan available for advanced AI tools.",
    },
  };
}

function breadcrumbLd(pathname, label) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url + "/" },
      { "@type": "ListItem", position: 2, name: label, item: canonicalFor(pathname) },
    ],
  };
}

function faqLd() {
  const qa = [
    ["Is resumes-gpt free to use?",
     "Yes. You can build, edit, and preview resumes for free using 30+ templates. The Elite plan unlocks advanced AI tools like the job agent and skill-based interview prep."],
    ["Are the resumes ATS-friendly?",
     "Yes. Templates are designed to pass Applicant Tracking Systems, and the built-in ATS score checker rates your resume on a 100-point scale with actionable fixes."],
    ["Does resumes-gpt support Indian job portals?",
     "Yes. It's tailored for the Indian market, with cover letters and job links oriented to platforms like LinkedIn."],
    ["Can I download my resume as PDF or DOCX?",
     "Yes, you can export your resume to PDF and DOCX formats."],
  ];
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

// ── Per-route metadata ────────────────────────────────────────────────────
// body: a short, crawlable fallback shown before React hydrates (prerender).
export const ROUTES = {
  "/": {
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    jsonLd: [organizationLd(), websiteLd(), softwareApplicationLd()],
    body: {
      h1: "Build an ATS-friendly resume with AI — free",
      intro:
        "resumes-gpt is India's AI-powered resume builder. Choose from 30+ professional templates, check your ATS score, generate tailored cover letters, get skill-based interview prep, and let the AI job agent find matching roles.",
    },
  },
  "/login": {
    title: "Login — resumes-gpt",
    description: "Sign in to resumes-gpt to build, edit, and manage your AI-powered resumes.",
    robots: "noindex,follow",
    jsonLd: [organizationLd()],
    body: { h1: "Login to resumes-gpt", intro: "Sign in to access your resumes and AI career tools." },
  },
  "/register": {
    title: "Create a free account — resumes-gpt",
    description: "Create a free resumes-gpt account to build ATS-friendly resumes with AI in minutes.",
    jsonLd: [organizationLd()],
    body: { h1: "Create your free account", intro: "Sign up to start building AI-powered, ATS-friendly resumes." },
  },
  "/page/about-us": {
    title: "About Us — resumes-gpt",
    description: "Learn about resumes-gpt, India's AI-powered resume builder and career platform, and our mission to help job seekers.",
    jsonLd: [organizationLd(), breadcrumbLd("/page/about-us", "About Us")],
    body: { h1: "About resumes-gpt", intro: "resumes-gpt helps job seekers in India build standout, ATS-friendly resumes with AI." },
  },
  "/page/faq": {
    title: "FAQ — resumes-gpt",
    description: "Frequently asked questions about resumes-gpt — pricing, ATS-friendliness, templates, downloads, and AI features.",
    jsonLd: [faqLd(), breadcrumbLd("/page/faq", "FAQ")],
    body: { h1: "Frequently Asked Questions", intro: "Answers about pricing, ATS-friendliness, templates, downloads, and AI features." },
  },
  "/page/blog": {
    title: "Blog — Career Tips & Resume Guides | resumes-gpt",
    description: "Career advice, resume writing tips, ATS guidance, and interview preparation guides from resumes-gpt.",
    jsonLd: [organizationLd(), breadcrumbLd("/page/blog", "Blog")],
    body: { h1: "resumes-gpt Blog", intro: "Career tips, resume guides, ATS advice, and interview preparation." },
  },
  "/page/contact-us": {
    title: "Contact Us — resumes-gpt",
    description: "Get in touch with the resumes-gpt team for support, partnerships, or feedback.",
    jsonLd: [organizationLd(), breadcrumbLd("/page/contact-us", "Contact Us")],
    body: { h1: "Contact resumes-gpt", intro: "Reach out for support, partnerships, or feedback." },
  },
  "/page/feedback": {
    title: "Feedback — resumes-gpt",
    description: "Share your feedback and help us improve resumes-gpt.",
    jsonLd: [breadcrumbLd("/page/feedback", "Feedback")],
    body: { h1: "Share your feedback", intro: "Tell us what you think and help us improve resumes-gpt." },
  },
  "/page/privacy-policy": {
    title: "Privacy Policy — resumes-gpt",
    description: "How resumes-gpt collects, uses, and protects your personal data.",
    jsonLd: [breadcrumbLd("/page/privacy-policy", "Privacy Policy")],
    body: { h1: "Privacy Policy", intro: "How resumes-gpt collects, uses, and protects your data." },
  },
  "/page/terms-of-service": {
    title: "Terms of Service — resumes-gpt",
    description: "The terms and conditions for using resumes-gpt.",
    jsonLd: [breadcrumbLd("/page/terms-of-service", "Terms of Service")],
    body: { h1: "Terms of Service", intro: "The terms and conditions for using resumes-gpt." },
  },
  "/page/refund-policy": {
    title: "Refund Policy — resumes-gpt",
    description: "resumes-gpt payment and refund policy for the Elite plan.",
    jsonLd: [breadcrumbLd("/page/refund-policy", "Refund Policy")],
    body: { h1: "Refund Policy", intro: "Payment and refund terms for the Elite plan." },
  },
  "/page/disclaimer": {
    title: "Disclaimer — resumes-gpt",
    description: "Legal disclaimer for resumes-gpt.",
    jsonLd: [breadcrumbLd("/page/disclaimer", "Disclaimer")],
    body: { h1: "Disclaimer", intro: "Legal disclaimer for resumes-gpt." },
  },
  "/resources/editorial-team": {
    title: "Editorial Team & Authors — resumes-gpt",
    description: "Meet the certified resume writers, recruiters, and HR experts behind resumes-gpt guides.",
    jsonLd: [organizationLd(), breadcrumbLd("/resources/editorial-team", "Editorial Team")],
    body: { h1: "Editorial Team & Authors", intro: "The career and resume experts behind resumes-gpt guides." },
  },
  "/resources/editorial-policy": {
    title: "Editorial Policy, Updates & Review Dates — resumes-gpt",
    description: "How resumes-gpt researches, updates, and reviews its career and resume content to keep it accurate.",
    jsonLd: [organizationLd(), breadcrumbLd("/resources/editorial-policy", "Editorial Policy")],
    body: { h1: "Editorial Policy, Updates & Review Dates", intro: "How we keep our content accurate and current." },
  },
  "/resources/sources-and-references": {
    title: "Sources & References — resumes-gpt",
    description: "The authoritative sources and references behind resumes-gpt resume, ATS, and career guidance.",
    jsonLd: [organizationLd(), breadcrumbLd("/resources/sources-and-references", "Sources & References")],
    body: { h1: "Sources & References", intro: "What our resume and career guidance is built on." },
  },
  "/user-guide": {
    title: "User Guide — How to Use resumes-gpt",
    description: "Step-by-step guide to resumes-gpt: create an account, pick a template, edit your resume, check your ATS score, use the AI writing tools, and the Elite toolkit.",
    jsonLd: [organizationLd(), breadcrumbLd("/user-guide", "User Guide")],
    body: { h1: "resumes-gpt User Guide", intro: "Step-by-step instructions for every feature, from sign-up to the Elite AI tools." },
  },
};

// Routes the prerender step should emit static HTML for (public, indexable-ish).
export const PRERENDER_ROUTES = [
  ...Object.keys(ROUTES),
  ...TEMPLATE_META.map((t) => `/resume-template/${t.slug}`),
];

// Resolve SEO for any pathname, with sensible fallbacks for unknown /page/:slug.
export function resolveSeo(pathname) {
  if (ROUTES[pathname]) return { path: pathname, ...ROUTES[pathname] };

  // Free resume template pages — strong long-tail SEO targets.
  if (pathname && pathname.startsWith("/resume-template/")) {
    const slug = pathname.slice("/resume-template/".length).replace(/\/$/, "");
    const meta = TEMPLATE_META.find((t) => t.slug === slug);
    if (meta) {
      return {
        path: pathname,
        title: `${meta.label} Example & Template (Free) — resumes-gpt`,
        description: `Free ${meta.role} resume example with a professional objective, work experience, skills, and a matching cover letter. Pick it and customize in minutes.`,
        jsonLd: [organizationLd(), breadcrumbLd(pathname, meta.label)],
        body: {
          h1: `${meta.label} — Free Example & Template`,
          intro: meta.objective,
        },
      };
    }
  }

  if (pathname && pathname.startsWith("/page/")) {
    const slug = pathname.slice("/page/".length).replace(/\/$/, "");
    const label = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      path: pathname,
      title: `${label} — resumes-gpt`,
      description: `${label} — resumes-gpt, India's AI-powered resume builder.`,
      jsonLd: [organizationLd(), breadcrumbLd(pathname, label)],
      body: { h1: label, intro: `${label} — resumes-gpt.` },
    };
  }

  return {
    path: pathname || "/",
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    jsonLd: [organizationLd(), websiteLd()],
    body: { h1: SITE.name, intro: SITE.defaultDescription },
  };
}
