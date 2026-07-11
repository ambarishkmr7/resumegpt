#!/usr/bin/env bash
# One-shot E2E runner: checks backend + emulator + Metro, seeds the test user,
# and runs the Maestro flows. Core flows always run; pass --ai to include the
# Gemini-dependent flows (create-resume, interview-smoke).
set -uo pipefail
cd "$(dirname "$0")/../.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
BASE="${API_BASE:-http://localhost:8000}"
MAESTRO="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
command -v maestro >/dev/null 2>&1 && MAESTRO=maestro

fail() { echo "ERROR: $1" >&2; exit 1; }

# 1. Backend up?
curl -sf "$BASE/api/health" > /dev/null || fail "backend not reachable at $BASE — start it: cd backend && .venv/bin/uvicorn app.main:app --port 8000"

# 2. Emulator attached?
$ADB get-state 2>/dev/null | grep -q device || fail "no Android device/emulator attached — start one: \$ANDROID_HOME/emulator/emulator -avd Medium_Phone_API_36.1"

# 3. Install the release APK (embedded JS bundle — deterministic for E2E).
#    Build it with: cd mobile/android && ./gradlew :app:assembleRelease
REL_APK="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$REL_APK" ]; then
  echo "Installing release APK…"
  $ADB install -r "$REL_APK" > /dev/null || fail "APK install failed"
else
  # Fall back to whatever build is installed (debug needs Metro running).
  $ADB shell pm list packages | grep -q com.resumesgpt.app || fail "app not installed — run: cd mobile && npx expo run:android"
  curl -sf "http://localhost:8081/status" | grep -q running || fail "Metro not running (needed for debug builds) — start it: cd mobile && npx expo start"
  $ADB reverse tcp:8081 tcp:8081 > /dev/null
fi

# 6. Seed test data.
bash e2e/scripts/seed.sh || fail "seeding failed"

# 7. Run flows.
FLOWS=(e2e/flows/auth.yaml e2e/flows/guest.yaml e2e/flows/editor-save.yaml e2e/flows/ats.yaml e2e/flows/paywall.yaml)
if [ "${1:-}" = "--ai" ]; then
  FLOWS+=(e2e/flows/create-resume.yaml e2e/flows/interview-smoke.yaml)
fi

PASS=0; FAIL=0; FAILED=()
for flow in "${FLOWS[@]}"; do
  echo ""
  echo "▶ $flow"
  if "$MAESTRO" test "$flow"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1)); FAILED+=("$flow")
  fi
done

echo ""
echo "══════════════════════════════════"
echo "E2E result: $PASS passed, $FAIL failed"
[ $FAIL -gt 0 ] && { printf 'Failed: %s\n' "${FAILED[@]}"; exit 1; }
exit 0
