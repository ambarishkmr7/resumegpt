-- ============================================================
-- ResumeGPT — MySQL Database Schema
-- 
-- Step 1: Create database (run as root):
--   CREATE DATABASE IF NOT EXISTS resumegpt_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--
-- Step 2: Run this script:
--   mysql -h localhost -u root -p resumegpt_db < schema.sql
-- ============================================================

-- Drop existing tables in correct order (child tables first)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS visitor_logs;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS resumes;
DROP TABLE IF EXISTS cms_pages;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users table
CREATE TABLE users (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) DEFAULT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_reset_token (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Resumes table
CREATE TABLE resumes (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    title VARCHAR(500) DEFAULT 'Untitled Resume',
    template_id VARCHAR(100) DEFAULT 'classic',
    content JSON NOT NULL,
    ats_score INT DEFAULT NULL,
    original_filename VARCHAR(500) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_resumes_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Subscriptions table
CREATE TABLE subscriptions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE,
    plan VARCHAR(50) DEFAULT 'elite',
    status VARCHAR(50) DEFAULT 'active',
    amount INT DEFAULT 299,
    payment_id VARCHAR(255) DEFAULT NULL,
    order_id VARCHAR(255) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_subscriptions_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Payments table (Razorpay transaction log)
CREATE TABLE payments (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    razorpay_order_id VARCHAR(255) DEFAULT NULL,
    razorpay_payment_id VARCHAR(255) DEFAULT NULL,
    razorpay_signature VARCHAR(512) DEFAULT NULL,
    plan VARCHAR(50) DEFAULT 'elite',
    amount INT DEFAULT 299,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) DEFAULT 'created',
    error_message TEXT DEFAULT NULL,
    refund_id VARCHAR(255) DEFAULT NULL,
    refund_amount INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_user_id (user_id),
    INDEX idx_payments_order_id (razorpay_order_id),
    INDEX idx_payments_payment_id (razorpay_payment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. CMS Pages table
CREATE TABLE cms_pages (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(500) NOT NULL,
    content TEXT DEFAULT '',
    icon VARCHAR(50) DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cms_pages_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Visitor Logs table
CREATE TABLE visitor_logs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    ip_address VARCHAR(100) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    path VARCHAR(500) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. OTP Verifications table
CREATE TABLE otp_verifications (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 8. Contact Messages & Feedback table
CREATE TABLE IF NOT EXISTS contact_messages (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(200) DEFAULT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'contact',   -- 'contact' or 'feedback'
    rating TINYINT DEFAULT NULL,          -- 1-5 stars (feedback only)
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contact_type (type),
    INDEX idx_contact_email (email),
    INDEX idx_contact_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed CMS Pages
-- ============================================================
INSERT IGNORE INTO cms_pages (id, slug, title, content, icon) VALUES
    (REPLACE(UUID(), '-', ''), 'about-us', '🏢 About Us', 'ResumeGPT is an AI-powered resume building platform.', '🏢'),
    (REPLACE(UUID(), '-', ''), 'disclaimer', '⚠️ Disclaimer', 'The information provided by ResumeGPT is for general informational purposes only.', '⚠️'),
    (REPLACE(UUID(), '-', ''), 'contact-us', '📬 Contact Us', 'Email: support@resumegpt.in', '📬'),
    (REPLACE(UUID(), '-', ''), 'faq', '❓ FAQ', 'Q: Do I need to pay to edit?\nA: No! Editing is free.', '❓'),
    (REPLACE(UUID(), '-', ''), 'feedback', '💬 Feedback', 'Share your experience at: support@resumegpt.in', '💬'),
    (REPLACE(UUID(), '-', ''), 'subscription', '👑 Subscription', 'Pro — ₹299 | Elite — ₹1,999 | One-time lifetime payments.', '👑'),
    (REPLACE(UUID(), '-', ''), 'whats-new', '🚀 What\'s New', 'Coming Soon: AI Career Counseling, Mock Interviews, Gap Analysis, AI Job Agent.', '🚀'),
    (REPLACE(UUID(), '-', ''), 'privacy-policy', '🔒 Privacy Policy', 'We never sell or share your personal data.', '🔒'),
    (REPLACE(UUID(), '-', ''), 'terms-of-service', '📄 Terms of Service', 'You retain ownership of all resume content you create.', '📄'),
    (REPLACE(UUID(), '-', ''), 'refund-policy', '💳 Refund Policy', 'Pro: 7-day refund. Elite: 14-day refund.', '💳');

-- ============================================================
-- Verify tables
-- ============================================================
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'id'
ORDER BY TABLE_NAME;
