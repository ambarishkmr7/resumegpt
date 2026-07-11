#!/usr/bin/env bash
# Seeds the local backend with the E2E test user (+ one resume so editor/ATS
# flows have something to open). Tolerates re-runs.
set -uo pipefail

BASE="${API_BASE:-http://localhost:8000}"
EMAIL="${E2E_EMAIL:-e2e.tester@example.com}"
PASSWORD="${E2E_PASSWORD:-e2e-password-123}"

echo "Seeding E2E user against $BASE"

register() {
  curl -s -X POST "$BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"full_name\":\"E2E Tester\"}"
}

login() {
  curl -s -X POST "$BASE/api/auth/login-json" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
}

TOKEN=$(register | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('access_token',''))
except Exception: print('')")

if [ -z "$TOKEN" ]; then
  TOKEN=$(login | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('access_token',''))
except Exception: print('')")
fi

if [ -z "$TOKEN" ]; then
  echo "ERROR: could not register or log in the E2E user" >&2
  exit 1
fi
echo "Got token."

# Delete resumes created by earlier test runs (keep the account under the
# 4-resume cap so create-resume.yaml can always add one).
curl -s "$BASE/api/resumes" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json
try:
  for r in json.load(sys.stdin):
    if r.get('title') != 'E2E Seed Resume': print(r['id'])
except Exception: pass" \
  | while read -r rid; do
      curl -s -X DELETE "$BASE/api/resumes/$rid" -H "Authorization: Bearer $TOKEN" > /dev/null
      echo "Deleted leftover resume $rid"
    done

# Pre-create a resume if the account has none (max 4 per user).
COUNT=$(curl -s "$BASE/api/resumes" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json
try: print(len(json.load(sys.stdin)))
except Exception: print(0)")

if [ "$COUNT" = "0" ]; then
  echo "Creating seed resume…"
  curl -s -X POST "$BASE/api/resumes" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title":"E2E Seed Resume","content":{"contact":{"name":"E2E Tester","title":"QA Engineer","email":"e2e.tester@example.com"},"summary":"Detail-oriented QA engineer with 4 years of experience in mobile test automation.","experience":[{"title":"QA Engineer","company":"TestCo","start":"Jan 2022","end":"Present","bullets":["Automated 300+ regression cases with Maestro"]}],"education":[{"degree":"B.Tech","school":"IIT","start":"2016","end":"2020"}],"skill_ratings":[{"name":"Test Automation","rating":5}]}}' > /dev/null
  echo "Seed resume created."
else
  echo "User already has $COUNT resume(s) — skipping."
fi

echo "Seed complete: $EMAIL / $PASSWORD"
