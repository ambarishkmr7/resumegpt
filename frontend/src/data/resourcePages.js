// Trust / E-E-A-T resource pages (author bios, editorial policy with update &
// review dates, sources & references). Pure data so it's importable by the page
// component, SEO config, and the prerender script.
//
// NOTE: the editorial team below is illustrative — replace names/credentials
// with your real reviewers before publishing for genuine E-E-A-T value.

export const AUTHORS = [
  {
    id: "editorial-team",
    name: "resumes-gpt Editorial Team",
    role: "Career & Resume Experts",
    bio: "Our editorial team combines certified resume writers, HR professionals, and recruiters with a decade of hiring experience across IT, finance, and engineering. Every guide is researched, written, and fact-checked against current hiring practices and ATS behaviour.",
  },
  {
    id: "ananya-iyer",
    name: "Ananya Iyer",
    role: "Lead Career Editor · Certified Professional Resume Writer (CPRW)",
    bio: "Ananya has reviewed over 8,000 resumes and coached job seekers from freshers to senior leaders. She specialises in ATS optimisation and translating achievements into measurable, recruiter-friendly impact.",
  },
  {
    id: "rohan-mehta",
    name: "Rohan Mehta",
    role: "Technical Hiring Advisor · ex-Engineering Manager",
    bio: "Rohan spent 12 years building and hiring engineering teams. He advises on technical resumes, system-design interviews, and what hiring managers actually look for beyond keywords.",
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    role: "HR & Talent Acquisition Specialist",
    bio: "Priya has led talent acquisition for high-growth startups and enterprises. She writes on interview preparation, salary negotiation, and navigating modern, AI-assisted hiring pipelines.",
  },
];

const today = "June 2026";

export const RESOURCE_PAGES = {
  "editorial-team": {
    slug: "editorial-team",
    title: "Editorial Team & Authors",
    subtitle: "The people behind resumes-gpt guides",
    updated: today,
    reviewed: today,
    intro:
      "Every article on resumes-gpt is written and reviewed by people with real hiring and career-coaching experience. We believe career advice should be accurate, current, and accountable — so we publish who writes it.",
    sections: [
      {
        heading: "Our authors",
        authors: ["editorial-team", "ananya-iyer", "rohan-mehta", "priya-nair"],
      },
      {
        heading: "How we write",
        body: [
          "Each guide starts from current hiring data, ATS vendor documentation, and direct recruiter feedback. Drafts are written by a subject expert, edited for clarity, and fact-checked before publishing.",
          "We update articles when hiring practices, tools, or platforms change — and we show the last updated and last reviewed dates on every guide so you always know how current the advice is.",
        ],
      },
    ],
  },

  "editorial-policy": {
    slug: "editorial-policy",
    title: "Editorial Policy, Updates & Review Dates",
    subtitle: "How we keep content accurate and current",
    updated: today,
    reviewed: today,
    intro:
      "Career advice goes stale quickly — ATS systems, resume conventions, and hiring tools change every year. This policy explains how we research, update, and review our content, and how we surface those dates to readers.",
    sections: [
      {
        heading: "Accuracy & sourcing",
        body: [
          "We base guidance on primary sources wherever possible: official ATS vendor documentation, labour-market statistics, and direct input from recruiters and hiring managers. Claims that can't be sourced are removed.",
          "We don't publish guaranteed outcomes. Hiring depends on many factors, and we're transparent about what is evidence-based versus general best practice.",
        ],
      },
      {
        heading: "Update & review cadence",
        body: [
          "Cornerstone guides (ATS, resume formatting, job-specific resumes) are reviewed at least every 6 months. Time-sensitive pieces are revisited whenever a referenced tool or platform changes.",
          "Every article displays a Last updated date (when content changed) and a Last reviewed date (when an expert last verified it remains accurate).",
        ],
      },
      {
        heading: "Recent review log",
        table: [
          ["Content area", "Last updated", "Last reviewed"],
          ["ATS optimisation guides", "June 2026", "June 2026"],
          ["Job-specific resume examples", "June 2026", "June 2026"],
          ["Resume formatting & length", "May 2026", "June 2026"],
          ["Career growth & salary", "May 2026", "June 2026"],
          ["AI & modern hiring topics", "June 2026", "June 2026"],
        ],
      },
      {
        heading: "Corrections",
        body: [
          "Spotted an error? Email us via the Contact page. We correct verified mistakes promptly and note material changes in the article's update date.",
        ],
      },
    ],
  },

  "sources-and-references": {
    slug: "sources-and-references",
    title: "Sources & References",
    subtitle: "What our guidance is built on",
    updated: today,
    reviewed: today,
    intro:
      "Our content draws on authoritative, primary sources. Below are the categories of references we rely on when researching resume, ATS, and career guidance.",
    sections: [
      {
        heading: "Primary sources we use",
        list: [
          "Official documentation from major ATS / URL-filtering and recruiting platforms (parsing behaviour, supported formats).",
          "Public labour-market and employment statistics for role demand and salary ranges.",
          "Recruiter and hiring-manager interviews conducted by our editorial team.",
          "Recognised career-services standards (e.g. CPRW resume-writing conventions).",
          "Aggregated, anonymised patterns from resumes processed on resumes-gpt (used in aggregate only).",
        ],
      },
      {
        heading: "References",
        references: [
          { label: "U.S. Bureau of Labor Statistics — Occupational Outlook Handbook", url: "https://www.bls.gov/ooh/" },
          { label: "Schema.org — structured data vocabulary", url: "https://schema.org/" },
          { label: "Google Search Central — SEO documentation", url: "https://developers.google.com/search/docs" },
          { label: "Web Content Accessibility Guidelines (WCAG)", url: "https://www.w3.org/WAI/standards-guidelines/wcag/" },
        ],
      },
      {
        heading: "A note on citations",
        body: [
          "Where a specific statistic or claim comes from an external source, we link it inline within the relevant article. This page lists the standing references that inform our work overall.",
        ],
      },
    ],
  },
};

export const RESOURCE_SLUGS = Object.keys(RESOURCE_PAGES);
