-- 7. OTP Verifications table
USE resumesgpt_db;

DROP TABLE IF EXISTS otp_verifications;
CREATE TABLE otp_verifications (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    mobile VARCHAR(100) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


update cms_pages set content = '**Terms of Service — resumesgpt**
 
 1. Rotate your password for your account security.
 2. You retain ownership of all resume content.
 3. Elite (₹1,999) are one-time lifetime payments.
 4. Do not use the platform for illegal purposes.
 5. AI suggestions are guidance — verify before use.
 6. resumesgpt is provided "as is" without Warranties.
 
 Last updated: May 2026'
 where id = 'cms_terms';


 update cms_pages set content = '**Elite Plan — ₹1,999 (One-time)**
 • Everything in Free
 • 🤖 AI Career Counseling Bot
 • 🎤 Mock Interview Practice
 • 📊 Interview Rating & Gap Analysis
 • 🚀 AI Job Application Agent 
 • 🚀 Learning Materials - skill based Q&A
 • 🤖 Chat bot based job search
 • 🚀 Priority support & Early access'
  where id = 'cms_sub';
 

-- authors_schema.sql — editorial authors + their posts
-- Target: MySQL (database: resumesgpt_db). Safe to run more than once.
-- Default login password for all seeded authors: Author@123  (CHANGE after first login)
--
-- NOTE: hashed_password values are real bcrypt ($2b$) hashes that the app verifies.

CREATE TABLE IF NOT EXISTS authors (
  id              VARCHAR(32)  NOT NULL,
  slug            VARCHAR(160) NOT NULL,
  name            VARCHAR(160) NOT NULL,
  role            VARCHAR(200) NULL,
  bio             TEXT NULL,
  credentials     VARCHAR(200) NULL,
  avatar_url      VARCHAR(512) NULL,
  linkedin_url    VARCHAR(512) NULL,
  email           VARCHAR(190) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  display_order   INT NOT NULL DEFAULT 100,
  created_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authors_slug (slug),
  UNIQUE KEY uq_authors_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS author_posts (
  id           VARCHAR(32)  NOT NULL,
  author_id    VARCHAR(32)  NOT NULL,
  title        VARCHAR(255) NOT NULL,
  slug         VARCHAR(200) NOT NULL,
  excerpt      VARCHAR(500) NULL,
  content      MEDIUMTEXT NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'published',
  created_at   DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_author_posts_author_id (author_id),
  KEY ix_author_posts_slug (slug),
  CONSTRAINT fk_author_posts_author FOREIGN KEY (author_id)
    REFERENCES authors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Seed authors (login credentials) ───────────────────────────────
INSERT IGNORE INTO authors (id, slug, name, role, bio, credentials, email, hashed_password, is_active, display_order)
VALUES ('754c909926b9481ca034e73f84b690c2', 'ananya-iyer', 'Ananya Iyer', 'Lead Career Editor · CPRW', 'Ananya has reviewed over 8,000 resumes and coached job seekers from freshers to senior leaders. She specialises in ATS optimisation and turning achievements into measurable, recruiter-friendly impact.', 'CPRW · 9 yrs', 'ananya@resumes-gpt.com', '$2b$12$r9G7Yw9udC3RN8ojqVEiSetJhuhuvWzdpqSHED9shJfX9HNo5T74a', 1, 10);
INSERT IGNORE INTO authors (id, slug, name, role, bio, credentials, email, hashed_password, is_active, display_order)
VALUES ('4c78d06138094560b52970cb3bbc9894', 'rohan-mehta', 'Rohan Mehta', 'Technical Hiring Advisor · ex-Engineering Manager', 'Rohan spent 12 years building and hiring engineering teams. He advises on technical resumes, system-design interviews, and what hiring managers look for beyond keywords.', 'ex-EM · 12 yrs', 'rohan@resumes-gpt.com', '$2b$12$4Q05EJ/.t.gaKnKIQ5pCNueLtp8uMCepK4Yse3zUuUZlpIfxjdICm', 1, 20);
INSERT IGNORE INTO authors (id, slug, name, role, bio, credentials, email, hashed_password, is_active, display_order)
VALUES ('33d19bc6212141228900acb77cc4f498', 'priya-nair', 'Priya Nair', 'HR & Talent Acquisition Specialist', 'Priya has led talent acquisition for high-growth startups and enterprises. She writes on interview preparation, salary negotiation, and modern AI-assisted hiring.', 'TA Lead · 10 yrs', 'priya@resumes-gpt.com', '$2b$12$j.3cZM8Sjw8P0YnLlbU6He7TQ4ZH1Do9e6l7EfJFBdVXObYN.sH2C', 1, 30);

-- ── Sample posts (optional) ────────────────────────────────────────
INSERT IGNORE INTO author_posts (id, author_id, title, slug, excerpt, content, status, published_at)
VALUES ('fc93ed332c934c0fb771a5c19ed24aa6', '754c909926b9481ca034e73f84b690c2', '5 Resume Bullet Mistakes That Cost Interviews', 'resume-bullet-mistakes', 'The five bullet-point habits that quietly sink applications — and how to fix each.', 'Most resumes fail on the bullets. Here are five common mistakes — vague verbs, no metrics, responsibility-listing instead of impact, keyword stuffing, and inconsistent tense — with a quick before/after for each.', 'published', NOW());
INSERT IGNORE INTO author_posts (id, author_id, title, slug, excerpt, content, status, published_at)
VALUES ('166e679165d645e28ac35423e6260418', '4c78d06138094560b52970cb3bbc9894', 'What Engineering Managers Actually Read First', 'what-em-read-first', 'A hiring manager''s 20-second scan, explained.', 'When I screened resumes, I looked for scope, impact, and ownership before anything else. This post walks through that 20-second scan so you can put the right signals where they''ll be seen.', 'published', NOW());

