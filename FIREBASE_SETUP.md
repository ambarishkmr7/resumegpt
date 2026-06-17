# Firebase Phone Auth — Setup Guide

Follow these steps exactly. Takes ~10 minutes.

---

## Step 1 — Install Firebase SDK

In your `resumebuilder/frontend/` folder:

```bash
npm install firebase
```

That's the only new dependency needed.

---

## Step 2 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → give it a name (e.g. `resumegpt`) → Continue
3. Disable Google Analytics if you don't need it → **Create project**

---

## Step 3 — Register a Web App

1. In your Firebase project, click the **`</>`** (Web) icon
2. Enter an app nickname (e.g. `resumegpt-web`) → **Register app**
3. You'll see a `firebaseConfig` object like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "resumegpt-xxxxx.firebaseapp.com",
  projectId: "resumegpt-xxxxx",
  storageBucket: "resumegpt-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

Copy these values — you'll need them in Step 5.

---

## Step 4 — Enable Phone Authentication

1. In Firebase Console → **Authentication** (left sidebar)
2. Click **"Get started"** if first time
3. Go to the **Sign-in method** tab
4. Click **Phone** → toggle **Enable** → **Save**

---

## Step 5 — Add Authorised Domain

1. Still in **Authentication** → **Settings** tab → **Authorised domains**
2. Your `localhost` is already there for dev
3. When you deploy, add your production domain (e.g. `resumegpt.yourdomain.com`)

---

## Step 6 — Configure your `.env`

Copy `.env.example` to `.env` and fill in the Firebase values from Step 3:

```env
VITE_API_BASE=http://localhost:8000

VITE_FIREBASE_API_KEY=AIzaSy_YOUR_KEY
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abcdefabcdef
```

---

## Step 7 — Copy the new files into your project

| File (from this output) | Copy to |
|---|---|
| `firebase.js` | `resumebuilder/frontend/src/firebase.js` |
| `ElitePanel.jsx` | `resumebuilder/frontend/src/components/ElitePanel.jsx` |
| `.env.example` | `resumebuilder/frontend/.env.example` |

Then create/update your real `.env` with the actual Firebase values.

---

## How it works (flow)

```
User types phone number
        ↓
normalisePhone() — strips spaces/dashes, prepends +91 if no country code
        ↓
Firebase RecaptchaVerifier (invisible) — resolves silently in background
        ↓
signInWithPhoneNumber(auth, phone, recaptchaVerifier)
        ↓
Firebase SMS gateway → real OTP delivered to user's phone
        ↓
User enters 6-digit code
        ↓
confirmationResult.confirm(code) — Firebase verifies
        ↓
api.verifyOtp() — backend records the verification (audit trail)
        ↓
otpVerified = true → Apply All button unlocks
```

---

## Testing in Development

Firebase Phone Auth has a **test phone numbers** feature so you don't use real SMS during dev:

1. Firebase Console → Authentication → **Sign-in method** → **Phone**
2. Scroll to **"Phone numbers for testing"**
3. Add a test number (e.g. `+91 9999999999`) and a fixed OTP (e.g. `123456`)
4. Use these in your app — Firebase won't send a real SMS and won't count against quota

---

## Production Checklist

- [ ] Firebase project created
- [ ] Phone auth enabled
- [ ] Production domain added to Authorised domains
- [ ] `VITE_FIREBASE_*` env vars set in your hosting environment (Vercel / Netlify / etc.)
- [ ] Firebase Blaze plan enabled if you expect >10k SMS/month (Spark plan = 10k free/month)
- [ ] reCAPTCHA Enterprise (optional but recommended for abuse prevention) — Firebase Console → App Check

---

## Troubleshooting

| Error | Fix |
|---|---|
| `auth/invalid-phone-number` | Include country code: `+91 9876543210` |
| `auth/too-many-requests` | Wait 1–2 minutes or use test phone numbers |
| `auth/quota-exceeded` | Upgrade to Blaze plan or use test numbers |
| `auth/unauthorized-domain` | Add your domain to Firebase Authorised domains |
| `RecaptchaVerifier` error | Ensure `<div id="recaptcha-container">` exists in the DOM when sendOtp is called |
| OTP not received | Check spam; test with Firebase test phone numbers first |
