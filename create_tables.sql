-- ============================================================
-- ResumeGPT — PostgreSQL Database Schema
-- Database: stocklens_db
-- Run: psql -h localhost -p 5432 -U admin -d stocklens_db -f create_tables.sql
-- ============================================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    hashed_password VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- 2. Resumes table
CREATE TABLE IF NOT EXISTS resumes (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) DEFAULT 'Untitled Resume',
    template_id VARCHAR(100) DEFAULT 'classic',
    content JSONB NOT NULL DEFAULT '{}',
    ats_score INTEGER,
    original_filename VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);

-- 3. Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(50) DEFAULT 'pro',
    status VARCHAR(50) DEFAULT 'active',
    amount INTEGER DEFAULT 299,
    payment_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- 4. CMS Pages table (for About Us, FAQ, Privacy Policy, etc.)
CREATE TABLE IF NOT EXISTS cms_pages (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT DEFAULT '',
    icon VARCHAR(50) DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug);

-- 5. Visitor Logs table (for analytics)
CREATE TABLE IF NOT EXISTS visitor_logs (
    id VARCHAR(64) PRIMARY KEY,
    ip_address VARCHAR(100),
    user_agent TEXT,
    path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Seed default admin user
-- Email: admin@resumegpt.com
-- Password: Admin@123 (bcrypt hashed below)
-- ============================================================

-- NOTE: The application auto-seeds the admin user on startup from .env
-- ADMIN_EMAIL and ADMIN_PASSWORD. You don't need to insert manually.
-- But if you want to insert directly via SQL:

-- Generate the hash in Python:
--   import bcrypt
--   bcrypt.hashpw(b"Admin@123", bcrypt.gensalt()).decode()

-- INSERT INTO users (id, email, full_name, hashed_password, is_admin, created_at)
-- VALUES (
--     'admin_seed_001',
--     'admin@resumegpt.com',
--     'Admin',
--     '$2b$12$PASTE_YOUR_BCRYPT_HASH_HERE',
--     TRUE,
--     CURRENT_TIMESTAMP
-- ) ON CONFLICT (email) DO UPDATE SET is_admin = TRUE;

-- ============================================================
-- Seed CMS Pages (the application auto-seeds these on first access)
-- ============================================================

INSERT INTO cms_pages (id, slug, title, content, icon, updated_at) VALUES
('cms_about', 'about-us', '🏢 About Us', 'ResumeGPT is an AI-powered resume building platform that helps professionals create, optimize, and manage their resumes with intelligent tools including ATS scoring, career roadmaps, and AI-driven improvements.', '🏢', CURRENT_TIMESTAMP),
('cms_disclaimer', 'disclaimer', '⚠️ Disclaimer', 'The information provided by ResumeGPT is for general informational purposes only. While we strive to keep the information up to date and accurate, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the information.', '⚠️', CURRENT_TIMESTAMP),
('cms_contact', 'contact-us', '📬 Contact Us', E'Have questions or feedback? Reach out to us:\n\nEmail: info@resumegpt.in\n\nOffice Hours: Monday - Friday, 9:00 AM - 6:00 PM IST', '📬', CURRENT_TIMESTAMP),
('cms_faq', 'faq', '❓ FAQ', E'**Q: How does the ATS scoring work?**\nA: Our ATS scorer uses a 100-point weighted rubric analyzing contact completeness, summary quality, experience bullet points, skills coverage, and keyword matching.\n\n**Q: Do I need to pay to edit my resume?**\nA: No! Resume editing, AI analysis, career roadmaps, and all tools are free.\n\n**Q: What''s included in the Elite plan?**\nA: Everything in Pro plus upcoming features: AI Career Counseling Bot, Mock Interviews, Interview Gap Analysis, and AI Agent Job Application.', '❓', CURRENT_TIMESTAMP),
('cms_feedback', 'feedback', '💬 Feedback', E'We''d love to hear from you! Your feedback helps us improve ResumeGPT.\n\nPlease share your experience at: support@resumegpt.in', '💬', CURRENT_TIMESTAMP),
('cms_sub', 'subscription', '👑 Subscription', E'**Pro Plan — ₹299 (One-time)**\n• Unlimited PDF & DOCX downloads\n• All 15 professional templates\n• AI career analysis & roadmap\n• Lifetime access\n\n**Elite Plan — ₹1,999 (One-time)**\n• Everything in Pro\n• 🤖 AI Career Counseling Bot (Coming Soon)\n• 🎤 Mock Interview Practice (Coming Soon)\n• 📊 Interview Rating & Gap Analysis (Coming Soon)\n• 🚀 AI Agent Job Application (Coming Soon)\n• Priority support', '👑', CURRENT_TIMESTAMP),
('cms_whatsnew', 'whats-new', '🚀 What''s New', E'**Coming Soon in ResumeGPT Elite:**\n\n🤖 **Career Counseling by AI Bot**\nGet personalized career advice through an interactive AI counselor.\n\n🎤 **Mock Interview Practice**\nPractice interviews with our AI interviewer tailored to your target role.\n\n📊 **Interview Rating & Gap Analysis**\nReceive detailed scoring, gap analysis, and suggested correct answers with references.\n\n🚀 **AI Agent Job Application**\nOur AI agent will search for relevant jobs, craft cover letters, and apply with tailored responses — all automatically.', '🚀', CURRENT_TIMESTAMP),
('cms_privacy', 'privacy-policy', '🔒 Privacy Policy', E'**Privacy Policy — ResumeGPT**\n\nWe respect your privacy.\n\n**Data We Collect:** Name, email, resume content, and usage analytics.\n**How We Use It:** To provide resume building services and improve our platform.\n**Data Sharing:** We never sell your personal data.\n**Data Security:** All data is encrypted in transit and at rest.\n**Your Rights:** Request deletion anytime at support@resumegpt.in.\n\nLast updated: May 2026', '🔒', CURRENT_TIMESTAMP),
('cms_terms', 'terms-of-service', '📄 Terms of Service', E'**Terms of Service — ResumeGPT**\n\n1. You are responsible for your account security.\n2. You retain ownership of all resume content.\n3. Pro (₹299) and Elite (₹1,999) are one-time lifetime payments.\n4. Do not use the platform for illegal purposes.\n5. AI suggestions are guidance — verify before use.\n6. ResumeGPT is provided "as is" without warranties.\n\nLast updated: May 2026', '📄', CURRENT_TIMESTAMP),
('cms_refund', 'refund-policy', '💳 Refund Policy', E'**Refund Policy — ResumeGPT**\n\n**Pro Plan (₹299):** Full refund within 7 days if no resume downloaded.\n**Elite Plan (₹1,999):** Full refund within 14 days. 50% refund within 30 days if features haven''t launched.\n\n**How to Request:** Email support@resumegpt.in with your registered email and payment ID.\nRefunds processed within 5-7 business days.', '💳', CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Verify
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM users;
-- SELECT * FROM cms_pages;
