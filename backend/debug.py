"""
Run this from the backend folder to diagnose login/register issues:
  cd resumebuilder/backend
  python debug.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

print("\n" + "="*60)
print("ResumeGPT — Auth Debug Script")
print("="*60)

# 1. Config
print("\n[1] CONFIG")
try:
    from app.config import get_settings
    s = get_settings()
    db_url = s.database_url
    masked = db_url[:30] + "..." if len(db_url) > 30 else db_url
    print(f"  DATABASE_URL : {masked}")
    print(f"  SECRET_KEY   : {'SET ✅' if s.SECRET_KEY != 'CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32' else 'DEFAULT (ok for dev) ⚠️'}")
    print(f"  GOOGLE_CLIENT_ID : {'SET ✅' if s.GOOGLE_CLIENT_ID else 'NOT SET ❌'}")
except Exception as e:
    print(f"  ERROR loading config: {e}")
    sys.exit(1)

# 2. DB connection
print("\n[2] DATABASE CONNECTION")
try:
    from app.database import engine, Base
    with engine.connect() as conn:
        print("  Connected ✅")
except Exception as e:
    print(f"  FAILED ❌: {e}")
    print("\n  FIX: Check your DATABASE_URL in backend/.env")
    print("  For SQLite, add: DATABASE_URL=sqlite:///./storage/app.db")
    sys.exit(1)

# 3. Tables
print("\n[3] TABLES")
try:
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    required = ["users", "resumes", "subscriptions"]
    for t in required:
        status = "✅" if t in tables else "❌ MISSING"
        print(f"  {t}: {status}")
    if not all(t in tables for t in required):
        print("\n  FIX: Tables are missing. Creating them now...")
        Base.metadata.create_all(bind=engine)
        print("  Tables created ✅")
except Exception as e:
    print(f"  ERROR: {e}")

# 4. User count
print("\n[4] USERS IN DB")
try:
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import User
    db: Session = SessionLocal()
    count = db.query(User).count()
    print(f"  Total users: {count}")
    if count > 0:
        first = db.query(User).first()
        print(f"  First user: {first.email} (admin={first.is_admin})")
    db.close()
except Exception as e:
    print(f"  ERROR: {e}")

# 5. Test password hashing
print("\n[5] PASSWORD HASH/VERIFY")
try:
    from app.core.security import hash_password, verify_password
    h = hash_password("testpassword123")
    ok = verify_password("testpassword123", h)
    print(f"  Hash+Verify: {'✅ Working' if ok else '❌ BROKEN'}")
except Exception as e:
    print(f"  ERROR: {e}")

# 6. Test register + login directly
print("\n[6] SIMULATED REGISTER + LOGIN")
try:
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import User
    from app.core.security import hash_password, verify_password, create_access_token

    db: Session = SessionLocal()
    TEST_EMAIL = "debug_test@resumegpt.in"
    TEST_PASS  = "TestPass1234"

    # Clean up previous test
    existing = db.query(User).filter(User.email == TEST_EMAIL).first()
    if existing:
        db.delete(existing); db.commit()

    # Register
    user = User(email=TEST_EMAIL, full_name="Debug Test", hashed_password=hash_password(TEST_PASS))
    db.add(user); db.commit(); db.refresh(user)
    print(f"  Register: ✅ User created (id={user.id[:8]}...)")

    # Login
    found = db.query(User).filter(User.email == TEST_EMAIL).first()
    if found and verify_password(TEST_PASS, found.hashed_password):
        token = create_access_token(found.id)
        print(f"  Login:    ✅ Token generated ({token[:20]}...)")
    else:
        print(f"  Login:    ❌ FAILED")

    # Cleanup
    db.delete(found); db.commit()
    db.close()
except Exception as e:
    print(f"  ERROR: {e}")
    import traceback; traceback.print_exc()

# 7. Test HTTP endpoint
print("\n[7] HTTP ENDPOINT TEST (requires backend running on :8000)")
try:
    import urllib.request, json
    data = json.dumps({"email":"httptest@test.com","password":"Test1234!","full_name":"HTTP Test"}).encode()
    req = urllib.request.Request("http://localhost:8000/api/auth/register",
        data=data, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            body = json.loads(r.read())
            print(f"  POST /api/auth/register: ✅ {r.status} — token={body.get('access_token','')[:20]}...")
            # cleanup: try to delete via another request (ignore errors)
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        detail = body.get("detail","")
        if "already registered" in str(detail):
            print(f"  POST /api/auth/register: ✅ Backend reachable (user already exists)")
        else:
            print(f"  POST /api/auth/register: ❌ {e.code} — {detail}")
    except Exception as e:
        print(f"  Backend not reachable (start it first): {e}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n" + "="*60)
print("Done. Share the output above to diagnose the issue.")
print("="*60 + "\n")
