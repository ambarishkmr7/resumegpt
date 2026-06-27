# resumesGPT — AI Resume Builder

India's AI-powered resume platform. Build ATS-optimised resumes, practice mock interviews, get personalised career roadmaps, and land your dream job — all in one place.

---

## Features

### Free (for everyone)

| # | Feature |
|---|---------|
| 1 | Create & edit unlimited resumes with 30 professional templates |
| 2 | Import existing resume — upload PDF or DOCX and parse it into an editable format |
| 3 | Live resume editor (contact, summary, experience, education, skills, projects, certifications) |
| 4 | ATS score (0–100) with per-category breakdown and concrete fix suggestions |
| 5 | One-click AI rewrite — generates 3 strategic resume variants |
| 6 | Career analysis — strengths, weaknesses, skill gap across 5 categories |
| 7 | Career roadmap — certifications, YouTube channels, Scaler / Coursera / Udemy links |
| 8 | Job search agent — LinkedIn, Naukri, Indeed, RemoteJobs.in with Glassdoor ratings |
| 9 | Cover letter generator tailored to each job |
| 10 | PDF & DOCX download with template-matched styling |
| 11 | Reference resume import — upload someone else's resume to enrich your own skills |
| 12 | Register / Login / Google OAuth / Facebook OAuth / Phone OTP (Firebase) |
| 13 | Forgot & reset password (email link) |

### Elite — ₹1,999 one-time lifetime

| Feature |
|---------|
| AI Career Counseling Bot — multi-turn conversation with full resume context |
| Mock Interview Practice — role-specific behavioral, technical & situational questions |
| Interview Rating & Gap Analysis — 0–100 score per answer with ideal-answer reference |
| AI Job Application Agent — searches jobs and generates tailored application materials |
| Priority support & early access to new features |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, React Router 6, Vite 5, plain CSS design system |
| **Backend** | FastAPI, SQLAlchemy 2, Starlette, Uvicorn |
| **Database** | SQLite (dev) · MySQL 8 (production) |
| **AI — primary** | Google Gemini (`gemini-flash-lite-latest` by default) |
| **AI — alternatives** | Anthropic Claude · xAI Grok (OpenAI-compatible) |
| **Auth** | JWT (python-jose + bcrypt) · Google OAuth · Facebook OAuth · Firebase Phone OTP |
| **Payments** | Razorpay (₹1,999 one-time Elite plan) |
| **File storage** | Local filesystem (dev) · S3-compatible: Cloudflare R2, AWS S3, MinIO (production) |
| **Resume parsing** | pdfplumber, python-docx, LLM-assisted fallback |
| **Resume generation** | reportlab (PDF), python-docx (DOCX) |

---

## Project Structure

```
resumegpt/
├── backend/
│   ├── app/
│   │   ├── auth/            # register, login, Google/Facebook OAuth, forgot/reset password
│   │   ├── core/            # JWT security, bcrypt, request dependencies
│   │   ├── resumes/         # parser, ats scorer, generator, upload/CRUD router
│   │   ├── templates/       # 30-template registry + router
│   │   ├── ai/              # Gemini / Claude / Grok clients + all AI services
│   │   ├── agent/           # LangGraph job-search & career agent
│   │   ├── subscription/    # Razorpay payment & subscription router
│   │   ├── profile/         # user profile router
│   │   ├── admin/           # admin panel router
│   │   ├── public_routes/   # unauthenticated stats & public data
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic request/response schemas (shared contract)
│   │   ├── config.py        # settings loaded from .env
│   │   ├── database.py      # engine, session factory
│   │   ├── storage.py       # local / S3 storage backend
│   │   └── main.py          # FastAPI app factory, middleware, router wiring, SPA fallback
│   ├── requirements.txt
│   ├── vercel.json
│   └── .env                 # (create from the template below — never commit)
├── frontend/
│   ├── src/
│   │   ├── pages/           # LandingPage, Dashboard, Editor, Login, Register, etc.
│   │   ├── components/      # ResumeForm, ResumePreview, ATSPanel, AIToolsPanel, …
│   │   ├── api/client.js    # typed fetch wrapper for all backend endpoints
│   │   ├── context/         # AuthContext (JWT persistence)
│   │   └── utils/           # pendingAction, helpers
│   ├── public/css/          # global design system CSS
│   ├── vite.config.js
│   └── .env                 # (create from the template below — never commit)
├── schema.sql               # MySQL schema for production setup
├── package.json             # root scripts (dev, build, prod, install:all)
├── start.ps1                # Windows PowerShell dev launcher (opens split terminals)
└── README.md
```

---

## Prerequisites

- **Python** 3.11+
- **Node.js** 18+ and npm
- **MySQL 8** for production (SQLite works out-of-the-box for development)

---

## Quick Start — Development (two ports)

Both servers start together with color-coded logs.

### 1. Clone & install

```bash
git clone <repo-url>
cd resumegpt

# Install root (concurrently) + frontend dependencies
npm run install:all

# Install backend Python dependencies
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
cd ..
```

### 2. Configure environment

## Production — Single Port (recommended)

Build the React app once; FastAPI serves it alongside the API from **one port**.

```bash
# 1. Build the frontend
cd fronend
npm run build
# Output: frontend/dist/

# 2. Start FastAPI (serves API + React app on port 8000)
cd backend
uvicorn app.main:app --reload --port 8000
```

Or use the root shortcut (builds + starts in one command):

```bash
cd backend
npm run prod
```

Open **http://localhost:8000** — the React SPA and all `/api/*` routes are served from the same process and port. No CORS configuration needed.

> Rebuild the frontend (`npm run build`) whenever you change frontend code. The backend reads from `frontend/dist/` at request time.

---

## MySQL Database Setup (production)

```sql
-- Run as MySQL root
CREATE DATABASE resumesgpt_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
# Apply schema
mysql -h localhost -u root -p resumesgpt_db < schema.sql
```

Then set the connection in `backend/.env`:
```env
DATABASE_URL=mysql+pymysql://user:password@localhost:3306/resumesgpt_db?charset=utf8mb4
```

SQLAlchemy auto-creates tables on startup in development (SQLite). For production MySQL, use `schema.sql`.

---

## Available npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start both backend and frontend with color-coded logs |
| `npm run dev:backend` | Backend only — http://localhost:8000 |
| `npm run dev:frontend` | Frontend only — http://localhost:5173 |
| `npm run build` | Build React app → `frontend/dist/` |
| `npm run start` | Start backend in production mode (4 workers, no reload) |
| `npm run prod` | Build frontend + start backend (single-port production) |
| `npm run install:all` | Install root + frontend node_modules |

---

## API Overview

All routes are prefixed with `/api/`.

| Prefix | Description |
|---|---|
| `/api/auth` | Register, login, Google/Facebook OAuth, forgot/reset password, guest register |
| `/api/resumes` | Create, list, get, update, delete resumes; upload PDF/DOCX; download PDF/DOCX |
| `/api/templates` | List available templates |
| `/api/agent` | AI job search, career analysis, career roadmap, cover letter, ATS scoring |
| `/api/subscription` | Razorpay order creation, payment verification, subscription status |
| `/api/profile` | User profile CRUD |
| `/api/admin` | Admin-only user and content management |
| `/api/public` | Unauthenticated stats (total resumes, ATS pass rate) |
| `/api/health` | Health check — returns DB type and AI status |

Full interactive docs at **`/docs`** (Swagger UI) when the backend is running.

---

## Deployment

### Vercel (backend only)

`backend/vercel.json` is configured to deploy the FastAPI app via `@vercel/python`. Point Vercel to the `backend/` directory. The React build would need to be served separately (Vercel static site, Netlify, or similar).

### Single-server (VPS / Docker)

1. Build the frontend: `npm run build`
2. Copy `frontend/dist/` into the backend directory (or keep the default relative path — it resolves automatically)
3. Run `uvicorn app.main:app --host 0.0.0.0 --port 80 --workers 4`
4. Optionally put nginx in front for SSL termination and gzip

---

## Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `CHANGE_ME…` | JWT signing secret — **always override in production** |
| `DATABASE_URL` | *(built from DB_\*)* | Full SQLAlchemy URL; overrides individual DB_\* vars |
| `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD` | localhost / 3306 / … | MySQL connection pieces |
| `GEMINI_API_KEY` | — | Primary AI provider (Google AI Studio) |
| `ANTHROPIC_API_KEY` | — | Alternative AI provider |
| `GROK_API_KEY` | — | xAI Grok (OpenAI-compatible) |
| `AI_MODEL` | `gemini-flash-lite-latest` | Active model identifier |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `S3_ENDPOINT_URL` | — | R2: `https://<id>.r2.cloudflarestorage.com` / AWS: leave empty |
| `S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY` | — | S3-compatible credentials |
| `S3_BUCKET_NAME` | `resume` | Bucket name |
| `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET` | — | Google OAuth 2.0 |
| `FACEBOOK_APP_ID / FACEBOOK_APP_SECRET` | — | Facebook Login |
| `RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET` | — | Razorpay payment gateway |
| `ADMIN_EMAIL / ADMIN_PASSWORD` | — | Auto-seeded admin account on startup |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `MAX_UPLOAD_MB` | `10` | Maximum file upload size |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` (1 day) | JWT expiry |

---

## Notes

- **Email delivery** for password reset is not wired to an SMTP provider. In development, the reset link is returned directly in the API response (`dev_reset_link`).
- **Legacy `.doc`** format is not supported — only `.docx` and `.pdf`.
- **AI features degrade gracefully** — all AI endpoints have deterministic fallbacks so the app remains fully functional without any API keys configured.
- **Token revocation** is not implemented — logout is stateless (client deletes the token). For production, add a token blocklist or use short-lived tokens with refresh.
