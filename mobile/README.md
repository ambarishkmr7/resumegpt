# resumesGPT Mobile

Modern Android + iOS app for resumesGPT, built with Expo (SDK 54) + React
Native + TypeScript. Talks to the FastAPI backend in `../backend` (all routes
under `/api/*`).

## Features (v1)

- Email/password, Google Sign-In, and instant **guest mode** (claimable later)
- Home dashboard: resumes (max 4), interview-minute meter, plan status
- **Create with AI** (name/role/years → full draft) and **import PDF/DOCX**
- Resume editor with 2s debounced autosave, template picker, native preview
- **ATS scoring** with job-description matching, keyword chips, fix-its
- AI tools: career analysis, career roadmap, cover letter (copy/share)
- PDF/DOCX download → share sheet, with 402 → Razorpay paywall
- **Live AI voice interview** (Gemini Live over WebSocket): 16 kHz PCM mic up,
  24 kHz PCM down, barge-in, timer, scored report, session history
- Subscriptions & refill packs via native Razorpay checkout + coupons

## Running (dev)

```bash
# 1. Backend
cd ../backend && .venv/bin/uvicorn app.main:app --port 8000

# 2. Metro + app (Android emulator or device)
npm install
npx expo run:android        # first time (builds the dev client)
npx expo start              # subsequent runs

# iOS (needs Xcode; all libraries are iOS-compatible)
npx expo run:ios
```

JDK 17 required for Android builds: `brew install openjdk@17` and
`export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.

## Tests

```bash
npm test                          # Jest: PCM audio utils, API client, errors

# E2E (Maestro): backend on :8000 + emulator running, then
cd android && ./gradlew :app:assembleRelease && cd ..
e2e/scripts/run-e2e.sh            # core flows (auth, guest, editor, ats, paywall)
e2e/scripts/run-e2e.sh --ai       # + Gemini flows (create-resume, interview)
```

## Layout

- `app/` — expo-router screens (tabs: Home · Interview · AI Tools · Profile)
- `src/api/` — typed client (port of `frontend/src/api/client.js`), 401/402 handling
- `src/audio/` — 16k/24k PCM engine on react-native-audio-api + pure PCM utils
- `src/interview/` — live WebSocket protocol + session lifecycle hook
- `src/payments/` — Razorpay order/subscription flows (free-coupon + demo short-circuits)
- `src/theme/` — design tokens (paper/terracotta/amber brand, Fraunces + Spline Sans)
- `e2e/` — Maestro flows + seed/runner scripts

## Notes

- No JWT refresh on the backend (1-day expiry): any 401 clears the session and
  returns to login.
- The Android emulator reaches the host backend via `http://10.0.2.2:8000`
  (cleartext enabled for dev builds only — set `APP_VARIANT=production` for
  store builds).
- `android/` is generated (`npx expo prebuild -p android`); config lives in
  `app.config.ts`.
