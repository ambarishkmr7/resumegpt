# resumesGPT — AI Resume Builder



---

## Prerequisites

- **Python** 3.11+
- **Node.js** 18+ and npm
- **MySQL 8** 

---

## Quick Start — Development (two ports)

Both servers start together with color-coded logs.

### 1. install
# Install backend Python dependencies
```bash

cd backend
python -m venv .venv
#.venv\Scripts\activate       # Windows
source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
cd ..
```

### 2. Configure environment

```bash
# 1. Build the frontend
cd fronend
npm install firebase
npm run build
# Output: frontend/dist/

# 2. Start FastAPI (serves API + React app on port 8000)
cd ..
cd backend
uvicorn app.main:app --reload --port 8000
```

Or use the root shortcut (builds + starts in one command):

```bash
cd backend
npm run prod
```

Verify DNS Authentication: Since your site is flagged as "spam", check that you have active SPF, DKIM, and DMARC records deployed in your DNS provider settings. Missing records trigger automatic spam categorizations by web threat engines.Scan for Unintended Code Injection: Confirm that no third-party script, advertisement network, or user-uploaded file on your application is hosting redirection paths or malicious scripts.
# Comprehensive Guide to Deploying SPF, DKIM, and DMARC Records

To set up SPF, DKIM, and DMARC, you must add **TXT records** to your domain’s DNS management dashboard (such as Cloudflare, Namecheap, GoDaddy, or Route 53). These three configurations work together as a chain to verify your identity and prove to security engines like Symantec that your domain is legitimate.

---

## Step 1: Set Up SPF (Sender Policy Framework)
SPF lists all the authorized server IP addresses allowed to send emails on behalf of your domain.

1. Log into your **DNS Provider** and navigate to your domain's DNS Settings.
2. Create a new record with the following values:
   * **Type**: `TXT`
   * **Host / Name**: `@` (or leave it blank depending on your provider)
   * **Value / Content**: `v=spf1 include:_://google.com ~all` 

> [!NOTE]
> *Replace `_://google.com` with the specific verification string provided by your actual email host. For example, Microsoft Office 365 utilizes `include:://outlook.com`.*

---

## Step 2: Set Up DKIM (DomainKeys Identified Mail)
DKIM signs your outgoing emails with a cryptographic digital signature, proving the message contents were not altered or tampered with during transit.

1. Log into your **Email Provider admin console** (e.g., Google Workspace, M365, cPanel).
2. Navigate to **DKIM Settings** and click **Generate New Record**.
3. Copy the specific **Host Name / Selector** (e.g., `google._domainkey` or `sig1._domainkey`) and the long generated **TXT Value**.
4. Return to your **DNS Provider**, create a new record, and insert the copied elements:
   * **Type**: `TXT`
   * **Host / Name**: *[Paste the selector provided by your email host]*
   * **Value / Content**: *[Paste the long cryptographic key string]*

---

## Step 3: Set Up DMARC (Domain-based Message Authentication, Reporting, and Conformance)
DMARC instructs receiving mail servers exactly how to handle emails that fail either your SPF or DKIM validation checks.

1. Go to your **DNS Provider** dashboard and create a new record:
   * **Type**: `TXT`
   * **Host / Name**: `_dmarc`
   * **Value / Content**: `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com`

> [!IMPORTANT]
> *Make sure to change `dmarc-reports@yourdomain.com` to a functional email inbox under your control to receive daily automated XML security compliance reports.*

---

## Step 4: Verify Your Configuration
DNS record updates can take up to **24 hours** to propagate across the internet. Once added, verify that your implementation is active and error-free:

* Visit a free online validation tool such as **MxToolbox** or **DMARCian**.
* Enter your domain name (`resumes-gpt.com`) to run a check and verify that all three records return a green "Pass" status.


## ################################################
# How to Fix Your DMARC Abuse Prevention Policy

Your **SPF** and **DKIM** records are passing perfectly, which means your legitimate emails are authenticating correctly. 

The security tool is triggering a warning because your current DMARC record contains **`p=none`**. This is a monitoring-only mode that tells receiving servers: *"If someone fakes my domain, let the email deliver anyway."* Security scanners flag this because it does not actively prevent spammers or phishers from spoofing your site.

To fix this warning, you must change your policy parameter (`p=`) to enforce stricter controls.

---

## The Solution: Update Your DNS Record

Log into your **DNS Provider dashboard** (e.g., Cloudflare, GoDaddy, Namecheap), find your existing `_dmarc` TXT record, and edit the value using one of the configurations below.

### Option A: Enforce Quarantine (Recommended Next Step)
This safely diverts unauthorized emails directly into the recipient's Spam/Junk folder instead of their Inbox. 

* **Host / Name**: `_dmarc`
* **Type**: `TXT`
* **Value / Content**: 
  ```text
  v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@resumes-gpt.com
  ```

### Option B: Enforce Reject (Maximum Security)
This instructs receiving mail servers to completely drop and block any unauthorized emails pretending to be from your domain.

* **Host / Name**: `_dmarc`
* **Type**: `TXT`
* **Value / Content**: 
  ```text
  v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@resumes-gpt.com
  ```

---

## Crucial Reminders Before Saving

1. **Update the Email Address**: Change `dmarc-reports@resumes-gpt.com` to a real, functioning inbox under your control. You will receive automated XML data reports there tracking your email compliance.
2. **The `pct=100` Tag**: This parameter ensures that your strict policy applies to 100% of the mail stream, which satisfies the validation requirements of security scanners.
3. **Safe Deployment**: Since your SPF and DKIM tags are already verified as active and passing, upgrading directly to `p=quarantine` or `p=reject` will **not** disrupt your own authentic business emails.

Once saved, allow up to an hour for the DNS record to refresh, then re-test your domain. The abuse warning will clear.
