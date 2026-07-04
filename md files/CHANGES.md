# ResumeGPT — Change Set

This bundle contains the files modified/added to implement the 8 requested items,
plus the security and code-quality fixes. Drop these into your repo, replacing the
existing files (paths are preserved). No new dependencies are required — `slowapi`
was already in `requirements.txt`.

> Note on environment: live job scraping and "web research" require network access
> at runtime. The code is wired to do the real work when you run it with internet;
> curated/AI-augmented content is used as a fallback so features work without keys.

---

## 1. AI Job Agent → LinkedIn-only, applies on behalf of the user
**File:** `backend/app/ai/services.py` (`ai_job_agent`), `frontend/src/components/ElitePanel.jsx`

- Source restricted to **LinkedIn only** (no Naukri/Indeed/Monster/etc.).
- Pulls **real LinkedIn postings** via `linkedin_tools.search_jobs`; falls back to a
  LinkedIn-only company list if scraping is blocked.
- Each job gets a tailored cover letter + recruiter Q&A and a single LinkedIn apply link.
- "Apply All" opens each LinkedIn apply page (one click each), records it against the
  user's verified email, and marks the job applied.
- **Why human-in-the-loop:** LinkedIn has no public auto-apply API and automating its UI
  violates its Terms of Service, so the agent prepares and launches applications but a
  verified click finalises each one. This is the only ToS-compliant design.

## 2. Mock Interview "Text" → downloadable learning materials + solved Q&A
**Files:** `backend/app/ai/services.py` (`interview_learning_materials`),
`backend/app/resumes/router.py` (`POST /api/resumes/interview-materials`),
`frontend/src/api/client.js` (`interviewMaterials`), `frontend/src/components/ElitePanel.jsx`

- The interactive text Q&A flow is replaced with a **Learning Materials** view:
  curated study resources (DSA, system design, behavioral, CS fundamentals) + a bank of
  **solved questions & answers**, AI-augmented with role-specific Q&A when a provider key
  is set.
- "Download (.md)" exports the whole pack as a Markdown file (built client-side).
- The **AI Audio Interview** mode is unchanged.
- Materials are curated stable links, not request-time scrapes (faster, more reliable,
  and avoids violating third-party site terms).

## 3. Find-jobs page → real listings
**File:** `backend/app/ai/services.py` (`suggest_job_listings`)

- `suggest_job_listings` already scraped real LinkedIn jobs but padded the result with
  ~49 **synthetic** portal cards (cycled company names + generic text). Those fake cards
  are **removed**. The page now shows genuine scraped LinkedIn postings, with an AI/
  deterministic LinkedIn fallback only when scraping returns nothing.
- The other portals remain only as "Browse all on" search links (legit links, not fake jobs).

## 4. "Browse all on" buttons → outlined pills, single row
**File:** `frontend/src/pages/JobsPage.jsx`

- Filled colored buttons replaced with **outlined pill** buttons (transparent fill,
  colored border + text, hover fills) in a single horizontally-scrollable row, matching
  `browonall.png`. The enclosing card border is removed.

## 5. Code-quality fixes
- Deleted dead/orphan files: `backend/app/ai/---services.py`, `backend/app/ai/---client.py`,
  `backend/app/auth/auth_router.py` (unused duplicate), `backend/debug.py`,
  `frontend/src/components/Topbar.jsx.bak`, and all `__pycache__/`.
- `backend/app/main.py`: removed import-time `print()` debugging; hardened the SPA static
  handler against **path traversal**; wired the rate limiter + handler.
- `backend/app/ai/client.py`: fixed the Anthropic provider defaulting to a *Gemini* model.
- `backend/app/subscription/router.py`: **closed the `/checkout` payment bypass** — it now
  only works in demo mode (no Razorpay keys); with live keys it forces the verified
  create-order → verify-payment (HMAC) flow.
- `backend/app/resumes/router.py`: demo OTP is only echoed in non-production.

## 6. Rate limiting on auth
**Files:** `backend/app/core/rate_limit.py` (new), `backend/app/main.py`,
`backend/app/auth/router.py`

- A single shared `slowapi` limiter is registered on the app with the
  `RateLimitExceeded` handler (the previous duplicate router had limits that were never
  active because that router wasn't mounted).
- Limits: register 5/min, login & OAuth 10/min, forgot-password 3/min, reset 5/min, guest 10/min.
- Behind a proxy, run uvicorn with `--proxy-headers` so the real client IP is used.

## 7. Account takeover via password reset — solution (implemented)
**Files:** `backend/app/auth/router.py` (`forgot_password`), `backend/app/email_service.py`
(`send_reset_email`)

The previous code returned the reset link in the HTTP response, so anyone could reset any
account. Fix:
- The reset link is **emailed** (out-of-band) via the existing SMTP service.
- The raw link/token is **never** returned in the API response in production; it's only
  surfaced in non-production (`APP_ENV != production`) for local testing.
- Response stays generic ("if the email exists…") to avoid account enumeration.
- Tokens remain single-use and short-lived (30 min); forgot-password is rate-limited (3/min).

## 8. Committed secrets — solution
**Files:** `backend/app/config.py`, `backend/.env.example`, `.gitignore` (already excludes `.env`)

- **Rotate the leaked credentials now** — treat the keys that were in `backend/.env`
  (Cloudflare R2, Gmail app password, Razorpay, Google/Facebook OAuth, JWT `SECRET_KEY`)
  as compromised.
- Never commit **or zip/share** `.env`; use `.env.example` with placeholders (added `APP_ENV`).
- Load real secrets from your host's secret manager / environment, not a file in the repo.
- Added a startup guard: with `APP_ENV=production`, the app **refuses to boot** if
  `SECRET_KEY` is still the placeholder or `FRONTEND_ORIGIN` points at localhost.

---

## Files in this bundle
```
backend/app/main.py                 (modified)
backend/app/config.py               (modified)
backend/app/core/rate_limit.py      (new)
backend/app/auth/router.py          (modified)
backend/app/email_service.py        (modified)
backend/app/resumes/router.py       (modified)
backend/app/subscription/router.py  (modified)
backend/app/ai/client.py            (modified)
backend/app/ai/services.py          (modified)
backend/.env.example                (modified)
frontend/src/api/client.js          (modified)
frontend/src/pages/JobsPage.jsx     (modified)
frontend/src/components/ElitePanel.jsx (modified)
```
Deleted (remove these from your repo):
`backend/app/ai/---services.py`, `backend/app/ai/---client.py`,
`backend/app/auth/auth_router.py`, `backend/debug.py`,
`frontend/src/components/Topbar.jsx.bak`

---

## Follow-up iteration

**A. Interview learning materials — expanded to ~100 solved Q&A with detailed explanations**
`backend/app/ai/services.py` (`interview_learning_materials`)
- Curated bank grown from 10 to **98** questions with detailed 3–5 sentence explanations,
  across Behavioral (12), HR (8), DSA (18), OOP (8), DBMS (12), OS (8), Networking (8),
  System Design (10), Web (6), Backend/Security (8).
- AI augmentation now **tops up toward 100** (capped at 100 total) and requests detailed
  multi-sentence answers. Works fully offline from the curated bank; the frontend already
  renders all categories with filters and the .md download.

**B. "Browse all on" last button cut off — fixed**
`frontend/src/pages/JobsPage.jsx`
- The pill row used `flex-wrap: nowrap` + horizontal scroll, which clipped the last pill.
  Switched to `flex-wrap: wrap` so pills flow onto additional lines and **none are cut**,
  keeping the outlined-pill styling.

---

## Follow-up iteration 2 — Skill-based AI-generated Q&A

**Solved Q&A now generated from the resume's skills via AI**
`backend/app/ai/services.py` (`interview_learning_materials`, new helper `_generate_skill_based_qa`),
`frontend/src/components/ElitePanel.jsx`

- **Primary path is now AI, driven by resume skills.** Skills are extracted and
  de-duplicated from the resume, then `_generate_skill_based_qa` asks the AI provider
  for ~5 detailed (3–5 sentence) Q&A per skill, processed in small batches to stay within
  model limits. Each question's `category` is set to the exact skill it tests, so the set
  is demonstrably tailored to the candidate. A short behavioral/HR batch is included too.
- **Curated bank is now a fallback only** (`fallback_qa`) — used when no AI provider is
  configured or generation fails, so the feature still returns ~100 questions offline.
- API response now includes `source` (`ai_skill_based` | `curated_fallback`) and
  `skills_used`. The UI shows "✨ Tailored to your resume skills: …" when AI-generated,
  or a hint to connect an AI key when falling back.
- Study resources gained a per-skill "targeted practice" section.

> Requires an AI provider key at runtime (ANTHROPIC/GEMINI/GROK per your `.env`). Without
> one, it transparently falls back to the curated bank.

---

## Follow-up iteration 3 — Learning Materials card + sitemap/robots

1. **Elite AI Features card** — added a "📚 Learning Materials" card to the Elite AI
   Features grid (`frontend/src/pages/LandingPage.jsx`), and gave that section an
   `id="elite-features"` anchor. (Also corrected the Job Agent card text to LinkedIn-only,
   matching the earlier agent change.)
2. **Sitemaps updated for the feature** — `frontend/public/sitemap.xml` gains entries for
   `/#elite-features` and `/#learning-materials`; `sitemap.html` lists "Learning Materials"
   under Tools & Features. (Note: it's a SPA feature with no standalone route, so these are
   homepage anchors — search engines generally ignore URL fragments, so the canonical
   indexable URL stays `/`; the entries mainly serve the human-readable sitemap.)
3. **sitemap.html resources** — added a "🔧 Resources" section linking `sitemap.xml` and
   `robots.txt`, and removed those two links from the footer (footer is now just the
   copyright line).
   Updated copies mirrored into `frontend/dist/` so the committed build matches.

---

## Follow-up iteration 4 — Remove sitemap/robots from app footer

- **`frontend/src/components/Footer.jsx`**: removed the `sitemap.xml` (XML Sitemap) and
  `robots.txt` links from the footer's Sitemap column. Kept the "HTML Sitemap" link, which
  is the gateway to `sitemap.html` where those two now live as cards.
- `sitemap.html` was already updated in the previous iteration: footer shows only the
  copyright line, and `sitemap.xml` + `robots.txt` appear as cards under the "🔧 Resources"
  section (mirrored in `frontend/public/` and `frontend/dist/`).
- Verified no inline "© … All rights reserved · sitemap.xml · robots.txt" footer remains
  anywhere in `src/`, `public/`, or `dist/`.

---

## Follow-up iteration 5 — SEO (meta, JSON-LD, prerender) + firewall checklist

**Per-route meta tags & JSON-LD (dependency-free)**
- `frontend/src/seo/seoConfig.js` (new): single source of truth — site constants,
  per-route title/description/canonical, and JSON-LD builders (Organization, WebSite,
  SoftwareApplication on home, FAQPage on /page/faq, BreadcrumbList on subpages).
  Pure ESM (no React/browser deps) so it's shared by the runtime component and the
  build script.
- `frontend/src/components/Seo.jsx` (new): drops a single `<Seo/>` into the router
  (mounted in `App.jsx`) and updates `<title>`, description, canonical, robots,
  Open Graph, Twitter cards, and JSON-LD on every route change. No new npm deps
  (uses `useEffect` + `useLocation`). All managed tags carry `data-seo` so runtime
  and prerendered tags stay in sync without duplication.
- `frontend/src/pages/CmsPage.jsx`: passes the loaded CMS page's title + a derived
  description to `<Seo/>` for dynamic /page/* routes.

**Prerender step for public pages**
- `frontend/scripts/prerender.mjs` (new): runs after `vite build` (wired into
  `package.json` `build` script). Reads the built shell and writes a static
  `index.html` per public route under `dist/<route>/` with the correct head tags,
  JSON-LD, and a small crawlable fallback `<body>` (replaced by React on load).
  No headless browser, no extra dependencies. Verified to emit 12 routes correctly.
- `backend/app/main.py`: the SPA catch-all now serves `dist/<route>/index.html` when
  present, so crawlers and corporate URL classifiers receive real static HTML.

**Firewall categorization**
- `firewall-categorization-checklist.md` (new, repo root): step-by-step submission
  links (Zscaler, Palo Alto, Cisco Talos, Fortinet, Symantec/Broadcom, Forcepoint),
  suggested categories, and pre/post-submission checks.

> Build note: `npm run build` now also prerenders. The runtime `<Seo>` works in dev
> without a build. No new dependencies were added.

---

## Follow-up iteration 6 — Category self-declaration (#3 code-side fix)

There's no tag a firewall is *forced* to honor, but a site can self-declare its
category through signals that URL classifiers, directory crawlers, and search
engines do read. Added these:

- `frontend/index.html` (shell, inherited by every prerendered page): category
  self-declaration meta tags — `rating=general`, `classification`, `category`
  (Business/Careers), `subject`, `keywords`, `author`, `distribution=global`,
  `coverage=Worldwide`, `audience`, plus Dublin Core (`DC.subject`, `DC.type=Service`).
  None are managed by `<Seo>`, so there's no duplication with per-route tags.
- `frontend/src/seo/seoConfig.js`: enriched JSON-LD — `SoftwareApplication` now
  declares `applicationCategory: BusinessApplication` + `applicationSubCategory`
  and `isAccessibleForFree`; `Organization` adds `knowsAbout`; `WebSite` adds
  `about` + `keywords`. These give crawlers/classifiers an explicit category.
- `frontend/public/humans.txt`: small legitimacy/credits file declaring the site
  category.

Verified after a simulated build + prerender that every route carries the global
category metas alongside its per-route title and JSON-LD.

> Reality check: these maximize the chance of correct/automatic categorization, but
> the authoritative category still lives in each vendor's database — so the
> submissions in `firewall-categorization-checklist.md` remain the definitive fix.

---

## Follow-up iteration 7 — Resume templates, footer socials, 4-resume cap

**Delivered this pass: items #1, #2, #4. (Items #3 editorial pages and #5 the 30
blog posts are staged for the next pass — both are large content builds.)**

### #1 Social media icons in footer
- `frontend/src/components/Footer.jsx` + `frontend/src/styles/app.css`: a centered
  row of LinkedIn, X, Instagram, Facebook, and YouTube icons (inline SVG, no deps)
  above the copyright bar, with circular hover states. Update the `href`s to your
  real profile URLs.

### #2 Free Resume Templates (home panel + per-role pages + pick flow)
- `frontend/src/data/resumeTemplates.js` (new): 28 role templates (Software Engineer
  → Lawyer) as pure data + a builder that produces a full, schema-valid ResumeContent
  (objective, 2 experience entries with quantified bullets, skills, competencies,
  education, certifications) and a matching role-specific cover letter.
- `frontend/src/components/ResumeTemplatesPanel.jsx` (new): collapsible "Free Resume
  Templates" panel on the home page listing all 28; each opens its page (with an "↗"
  to open in a new tab).
- `frontend/src/pages/ResumeTemplatePage.jsx` (new) at `/resume-template/:slug`:
  professional resume preview + cover letter, Back button, and "Pick this resume".
  Picking auto-creates a guest account if needed (the app's existing pattern), saves
  the resume, and lands the user on the home page's **My Resumes** section
  (`/?picked=1#my-resumes`, with smooth-scroll).
- Wiring: route added in `App.jsx`; panel + `id="my-resumes"` anchor + post-pick
  scroll in `LandingPage.jsx`.
- SEO: `seoConfig.js` resolves per-role titles/descriptions + JSON-LD, all 28 pages
  are prerendered (now 40 static routes total) and added to `sitemap.xml`.

### #4 Max 4 resumes
- `backend/app/resumes/router.py`: `MAX_RESUMES = 4` enforced on both create and
  upload (HTTP 409 with a clear message). The pick-resume flow surfaces the message.

---

## Follow-up iteration 7 — blog prerender + sitemap discoverability + complete bundle

- `frontend/scripts/prerender.mjs`: now also prerenders all 30 blog posts
  (`/blog/<slug>`) with per-post title, description, and **Article** JSON-LD
  (headline, datePublished/dateModified, author, publisher, articleSection).
  Total static routes emitted: 73 (12 core + 3 resources + 28 templates + 30 blogs).
- `frontend/public/sitemap.xml`: added 30 blog URLs + 3 editorial/resource URLs
  (templates were already present). Now 75 URLs, validated well-formed.
- `frontend/public/sitemap.html`: added "Resume Templates" (28) and "Blog Articles"
  (30) sections, plus the 3 editorial pages under Resources — better internal
  linking for crawlers and classifiers.
- **Bundle fix:** this archive now contains the COMPLETE changed-file set (diffed
  against the original upload), including the resume-template, blog, and editorial
  data/page files that were missing from earlier archives.
