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


-- ============================================================================
-- Billing: subscription plans, refill packs, coupons & metered interview usage
-- Target: MySQL. New tables are also auto-created by SQLAlchemy create_all();
-- the ALTER statements below are the part create_all() cannot do (adding
-- columns to existing tables) and must be run once on existing installs.
-- MySQL has no "ADD COLUMN IF NOT EXISTS" — ignore "Duplicate column" errors
-- if a column already exists.
-- ============================================================================

-- ── Extend existing tables ──────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN plan_id VARCHAR(64) NULL,
  ADD COLUMN interval VARCHAR(20) DEFAULT 'monthly',
  ADD COLUMN razorpay_subscription_id VARCHAR(120) NULL,
  ADD COLUMN current_period_start DATETIME NULL,
  ADD COLUMN current_period_end DATETIME NULL,
  ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE;

ALTER TABLE payments
  ADD COLUMN razorpay_subscription_id VARCHAR(120) NULL,
  ADD COLUMN type VARCHAR(20) DEFAULT 'subscription',
  ADD COLUMN plan_id VARCHAR(64) NULL,
  ADD COLUMN refill_pack_id VARCHAR(64) NULL,
  ADD COLUMN base_amount_inr INT NULL,
  ADD COLUMN discount_inr INT DEFAULT 0,
  ADD COLUMN coupon_code VARCHAR(64) NULL;

-- ── New tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  price_inr INT DEFAULT 500,
  currency VARCHAR(8) DEFAULT 'INR',
  billing_interval VARCHAR(20) DEFAULT 'monthly',
  interview_minutes INT DEFAULT 60,
  allowances JSON NULL,
  features JSON NULL,
  badge VARCHAR(60) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 100,
  razorpay_plan_id VARCHAR(120) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plans_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refill_packs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  price_inr INT DEFAULT 99,
  currency VARCHAR(8) DEFAULT 'INR',
  resource_type VARCHAR(40) DEFAULT 'interview_seconds',
  amount_seconds INT DEFAULT 1800,
  bonus_seconds INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refill_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  discount_type VARCHAR(16) DEFAULT 'percent',
  discount_value INT DEFAULT 10,
  applies_to VARCHAR(16) DEFAULT 'all',
  min_amount_inr INT DEFAULT 0,
  max_redemptions INT NULL,
  redeemed_count INT DEFAULT 0,
  per_user_limit INT DEFAULT 1,
  starts_at DATETIME NULL,
  expires_at DATETIME NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  coupon_id VARCHAR(64) NOT NULL,
  coupon_code VARCHAR(64) NULL,
  user_id VARCHAR(64) NOT NULL,
  payment_id VARCHAR(64) NULL,
  discount_inr INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY ix_redemptions_coupon (coupon_id),
  KEY ix_redemptions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_accounts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(40) DEFAULT 'interview_seconds',
  allowance_seconds INT DEFAULT 0,
  used_seconds INT DEFAULT 0,
  refill_seconds INT DEFAULT 0,
  source VARCHAR(20) DEFAULT 'trial',
  plan_id VARCHAR(64) NULL,
  cycle_start DATETIME NULL,
  cycle_end DATETIME NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_usage_user_resource (user_id, resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(40) DEFAULT 'interview_seconds',
  delta_seconds INT DEFAULT 0,
  reason VARCHAR(40) DEFAULT 'interview_consume',
  ref_id VARCHAR(64) NULL,
  balance_after INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY ix_usage_events_user (user_id),
  KEY ix_usage_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(80) NOT NULL PRIMARY KEY,
  value JSON NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(120) NOT NULL PRIMARY KEY,
  event_type VARCHAR(80) NULL,
  payload JSON NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

