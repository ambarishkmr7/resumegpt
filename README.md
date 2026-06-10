# ResuméForge — Resume Builder

A full-stack resume builder inspired by [Enhancv](https://enhancv.com/). Upload a
résumé, edit every section in a live editor, switch templates, see an explainable
ATS score with concrete fixes, pull skills from a reference résumé, generate a
tailored cover letter, and download as **PDF** or **DOCX**.

## Features

| # | Feature | Where |
|---|---------|-------|
| 1 | Register / login / logout / forgot + reset password (JWT) | `backend/app/auth`, `frontend/src/pages/{Login,Register,ForgotPassword,ResetPassword}.jsx` |
| 2 | Upload résumé (PDF/DOCX) → parsed into editable sections | `parser.py`, Dashboard "Import" |
| 3 | Template gallery (5 distinct layouts) re-styles the résumé instantly | `templates/registry.py`, `TemplateSelector.jsx`, `ResumePreview.jsx` |
| 4 | Editable panel for every section (contact, summary, experience, education, skills, projects, certs) | `ResumeForm.jsx` |
| 5 | Download as PDF and DOCX | `generator.py`, Editor toolbar |
| 6 | ATS score (0–100) with per-category breakdown | `ats.py`, `ATSPanel.jsx` |
| 7 | Concrete suggestions to push the score toward 100% + one-click "AI improve" | `ats.py` issues + `ai/services.py` |
| 8 | Upload someone else's résumé as a **reference** to enrich your own | `parse-reference` endpoint, Editor "Use reference résumé" |
| 9 | Generate a cover letter from the résumé | `ai/services.py`, `CoverLetterModal.jsx` |

## Tech stack

- **Backend:** FastAPI · SQLAlchemy 2 · SQLite (dev) · JWT (python-jose) · bcrypt ·
  pdfplumber + python-docx (parsing) · reportlab + python-docx (generation)
- **Frontend:** React 18 · React Router 6 · Vite · plain CSS design system
- **AI (optional):** Anthropic Messages API via httpx. Every AI feature has a
  deterministic fallback, so the app is fully functional **without** an API key.

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
cp .env.example .env          # edit SECRET_KEY; ANTHROPIC_API_KEY is optional
uvicorn app.main:app --reload # serves http://localhost:8000
```

API docs auto-generated at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE can stay empty in dev (Vite proxies /api)
npm run dev                   # serves http://localhost:5173
```

Open `http://localhost:5173`, register an account, and start building.

## How uploads, templates, and editing fit together

When you upload a résumé, the app **extracts your content** (contact, summary,
experience, skills, education, etc.) into a structured format, then renders it as
a clean, professional résumé you can edit and restyle. This is the same model
Enhancv uses: rather than preserving the exact pixels of your original file, it
captures *what your résumé says* and lets you control *how it looks*.

- The **preview** reflects your real content and updates live as you edit.
- The **template gallery** offers five visually distinct layouts — Classic
  (centered serif), Modern (accent bars), Executive (two-column sidebar), Minimal
  (airy whitespace), and Creative (colored banner). Clicking one instantly
  restyles the whole résumé, and the downloaded PDF/DOCX matches the chosen
  template's accent and font.
- The **enhancement toolbar** at the top of the editor provides the AI improve,
  cover-letter, reference-résumé, and PDF/DOCX download actions.

If you instead need the *original uploaded file* displayed verbatim (e.g. an
embedded PDF viewer), that's a separate feature from the editable/restylable
résumé and can be added alongside it.

## The pieces in detail

The shape of a résumé (`ResumeContent` in `backend/app/schemas.py`) is the single
contract shared across **parse → edit → score → generate**. The frontend factories
in `frontend/src/lib.js` mirror that schema, so any field added on the backend just
needs a matching factory entry.

- **Parsing** (`parser.py`) extracts raw text then heuristically segments it by
  section headers and regex (contact details, date ranges, bullets). If an
  `ANTHROPIC_API_KEY` is set, an AI parse runs first for higher accuracy and falls
  back to heuristics on any failure.
- **ATS scoring** (`ats.py`) is deliberately **rule-based and explainable** — a
  100-point weighted rubric (contact, summary, experience quality, skills,
  education, formatting, and keyword match when a job description is supplied).
  Every deduction produces an `issue` with a `severity` and a concrete
  `suggestion`, which is exactly what the UI lists under "Suggestions to reach
  100%."
- **Generation** (`generator.py`) renders the same content to PDF (reportlab) and
  DOCX (python-docx), reading the accent color from the selected template.

## Notes / production TODOs

This is a complete, runnable reference implementation. For production you'd want:

- **Email delivery** for forgot-password. In dev the endpoint returns a
  `dev_reset_link` in the JSON response instead of emailing it.
- **Postgres** instead of SQLite, with **Alembic** migrations (currently tables are
  auto-created on startup).
- **Refresh tokens / token revocation** (logout is currently stateless client-side).
- **Hardened file storage** (size/type limits exist; add virus scanning + object
  storage like S3 for multi-instance deploys).
- Legacy `.doc` is **not** supported — only `.docx` and `.pdf`.

## Project layout

```
resume-builder/
├── backend/
│   ├── app/
│   │   ├── auth/          # register, login, logout, forgot/reset password
│   │   ├── core/          # security (bcrypt + JWT), dependencies
│   │   ├── resumes/       # parser, ats, generator, router
│   │   ├── templates/     # template registry + router
│   │   ├── ai/            # Anthropic client + services (with fallbacks)
│   │   ├── models.py      # User, Resume
│   │   ├── schemas.py     # the shared data contract
│   │   └── main.py        # app factory, CORS, router wiring
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/         # Login, Register, ForgotPassword, ResetPassword, Dashboard, Editor
        ├── components/    # ResumeForm, ResumePreview, TemplateSelector, ATSPanel, CoverLetterModal, Topbar, AuthLayout
        ├── api/client.js  # typed-ish fetch wrapper for the whole API
        ├── context/       # AuthContext (token persistence)
        └── styles/app.css # design system
```


npm install --save-dev vite@5.4.8 @vitejs/plugin-react@4.3.1
