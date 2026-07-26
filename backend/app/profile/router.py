"""User Profile API — get/update profile + compute completion %."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import User, UserProfile
from app.schemas import (
    PersonalInfo,
    ProfileEducationItem,
    ProfileExperienceItem,
    ProfilePreferences,
    UserProfileOut,
    UserProfileUpdate,
)
from app.storage import StorageService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profile", tags=["profile"])

_CONTENT_TYPES: dict[str, str] = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "gif": "image/gif",
}

# ── Completion scoring ────────────────────────────────────────────────────────

def _filled_ratio(fields: list[str], data: dict[str, Any], list_field: str | None = None) -> float:
    """Return fraction of *fields* that are non-empty in *data*."""
    filled = 0
    for f in fields:
        val = data.get(f)
        if list_field and f == list_field:
            if isinstance(val, list) and any(str(v).strip() for v in val):
                filled += 1
        elif str(val or "").strip():
            filled += 1
    return filled / len(fields) if fields else 0


def _compute_completion(data: dict[str, Any]) -> int:
    """Compute profile completion percentage (0–100). Five sections × 20 pts each."""
    score = 0

    # Personal: 6 fields × equal weight
    personal = data.get("personal") or {}
    score += int(_filled_ratio(
        ["full_name", "phone", "location", "linkedin_url", "headline", "summary"], personal
    ) * 20)

    # Education: 10 pts for having entries + 10 pts for first entry completeness
    education = data.get("education") or []
    if education:
        score += 10
        first = education[0] if isinstance(education[0], dict) else {}
        score += int(_filled_ratio(["degree", "school"], first) * 10)

    # Experience: 10 pts for having entries + 10 pts for first entry completeness
    experience = data.get("experience") or []
    if experience:
        score += 10
        first = experience[0] if isinstance(experience[0], dict) else {}
        score += int(_filled_ratio(["title", "company"], first) * 10)

    # Skills: proportional up to 3 skills = full 20 pts
    skills = data.get("skills") or []
    skill_count = len([s for s in skills if str(s).strip()])
    score += min(int((skill_count / 3) * 20), 20)

    # Preferences: 4 fields × equal weight
    prefs = data.get("preferences") or {}
    score += int(_filled_ratio(
        ["desired_role", "preferred_locations", "job_type", "remote_preference"],
        prefs, list_field="preferred_locations",
    ) * 20)

    return min(score, 100)


# ── Resume → profile prefill ──────────────────────────────────────────────────

def _map_resume_education(items: list) -> list[dict[str, Any]]:
    return [{
        "degree": e.get("degree") or "",
        "school": e.get("school") or "",
        "location": e.get("location") or "",
        "start_year": e.get("start") or "",
        "end_year": e.get("end") or "",
        "grade": e.get("details") or "",
    } for e in items if isinstance(e, dict)]


def _map_resume_experience(items: list) -> list[dict[str, Any]]:
    out = []
    for e in items:
        if not isinstance(e, dict):
            continue
        end = e.get("end") or ""
        is_present = not end or end.strip().lower() == "present"
        out.append({
            "title": e.get("title") or "",
            "company": e.get("company") or "",
            "location": e.get("location") or "",
            "start_date": e.get("start") or "",
            "end_date": "" if is_present else end,
            "current": is_present,
            "description": "\n".join(e.get("bullets") or []),
        })
    return out


def _merge_latest_resume(db: Session, user_id: str, data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Fill empty profile fields from the user's most recent resume.

    The profile always wins where it has a value; the resume only fills blanks.
    This runs server-side so every caller sees the same profile *and the same
    completion score* — when this merge lived only in the profile screen, the
    dashboard reported the saved-but-empty profile (3%) while the profile page
    showed the resume-filled form (85%) for the very same account.

    Returns (merged_data, prefilled) — `prefilled` drives the "review and save"
    banner, since none of this is persisted until the user saves.
    """
    from app.models import Resume

    resume = (
        db.query(Resume)
        .filter(Resume.user_id == user_id)
        .order_by(Resume.updated_at.desc().nullslast())
        .first()
    )
    content = (resume.content or {}) if resume else {}
    if not content:
        return data, False

    contact = content.get("contact") or {}
    merged = {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
              for k, v in data.items()}
    prefilled = False

    personal = dict(merged.get("personal") or {})
    for profile_field, resume_value in (
        ("full_name", contact.get("name")),
        ("phone", contact.get("phone")),
        ("location", contact.get("location")),
        ("linkedin_url", contact.get("linkedin")),
        ("headline", contact.get("title")),
        ("summary", content.get("summary")),
    ):
        if not str(personal.get(profile_field) or "").strip() and str(resume_value or "").strip():
            personal[profile_field] = resume_value
            prefilled = True
    merged["personal"] = personal

    if not (merged.get("education") or []):
        edu = _map_resume_education(content.get("education") or [])
        if edu:
            merged["education"] = edu
            prefilled = True

    if not (merged.get("experience") or []):
        exp = _map_resume_experience(content.get("experience") or [])
        if exp:
            merged["experience"] = exp
            prefilled = True

    if not (merged.get("skills") or []):
        skills = [str(s) for s in (content.get("skills") or []) if str(s).strip()]
        if skills:
            merged["skills"] = skills
            prefilled = True

    prefs = dict(merged.get("preferences") or {})
    if not str(prefs.get("desired_role") or "").strip() and str(contact.get("title") or "").strip():
        prefs["desired_role"] = contact["title"]
        prefilled = True
    merged["preferences"] = prefs

    return merged, prefilled


def _empty_profile_data() -> dict[str, Any]:
    return {
        "personal": {},
        "education": [],
        "experience": [],
        "skills": [],
        "preferences": {},
    }


def _merge_update(existing: dict[str, Any], update: UserProfileUpdate) -> dict[str, Any]:
    """Merge UserProfileUpdate into existing profile data dict."""
    data = dict(existing)
    if update.personal is not None:
        data["personal"] = update.personal.model_dump()
    if update.education is not None:
        data["education"] = [e.model_dump() for e in update.education]
    if update.experience is not None:
        data["experience"] = [e.model_dump() for e in update.experience]
    if update.skills is not None:
        data["skills"] = update.skills
    if update.preferences is not None:
        data["preferences"] = update.preferences.model_dump()
    return data


def _profile_to_out(user_id: str, data: dict[str, Any], photo_key: str | None, updated_at,
                    prefilled_from_resume: bool = False) -> UserProfileOut:
    """Convert raw profile data dict to UserProfileOut schema."""
    personal = PersonalInfo(**(data.get("personal") or {}))
    education = [ProfileEducationItem(**e) if isinstance(e, dict) else e
                 for e in (data.get("education") or [])]
    experience = [ProfileExperienceItem(**e) if isinstance(e, dict) else e
                  for e in (data.get("experience") or [])]
    skills = [str(s) for s in (data.get("skills") or [])]
    preferences = ProfilePreferences(**(data.get("preferences") or {}))

    completion = _compute_completion(data)

    return UserProfileOut(
        user_id=user_id,
        personal=personal,
        education=education,
        experience=experience,
        skills=skills,
        preferences=preferences,
        profile_photo_key=photo_key,
        profile_completion=completion,
        updated_at=updated_at,
        prefilled_from_resume=prefilled_from_resume,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserProfileOut)
def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's profile. Creates an empty one if it doesn't exist."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        # Auto-create empty profile
        profile = UserProfile(
            user_id=current_user.id,
            personal={"email": current_user.email, "full_name": current_user.full_name or ""},
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    data = {
        "personal": profile.personal or {},
        "education": profile.education or [],
        "experience": profile.experience or [],
        "skills": profile.skills or [],
        "preferences": profile.preferences or {},
    }
    data, prefilled = _merge_latest_resume(db, current_user.id, data)
    return _profile_to_out(current_user.id, data, profile.profile_photo_key, profile.updated_at,
                           prefilled_from_resume=prefilled)


@router.put("/me", response_model=UserProfileOut)
def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile (upsert)."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        existing = _empty_profile_data()
        merged = _merge_update(existing, payload)
        profile = UserProfile(
            user_id=current_user.id,
            personal=merged.get("personal", {}),
            education=merged.get("education", []),
            experience=merged.get("experience", []),
            skills=merged.get("skills", []),
            preferences=merged.get("preferences", {}),
        )
        db.add(profile)
    else:
        existing = {
            "personal": profile.personal or {},
            "education": profile.education or [],
            "experience": profile.experience or [],
            "skills": profile.skills or [],
            "preferences": profile.preferences or {},
        }
        merged = _merge_update(existing, payload)
        profile.personal = merged.get("personal", {})
        profile.education = merged.get("education", [])
        profile.experience = merged.get("experience", [])
        profile.skills = merged.get("skills", [])
        profile.preferences = merged.get("preferences", {})

    db.commit()
    db.refresh(profile)

    return _profile_to_out(current_user.id, merged, profile.profile_photo_key, profile.updated_at)


# ── Photo upload ─────────────────────────────────────────────────────────────

@router.post("/photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a profile photo. Returns the storage key."""
    settings = get_settings()
    storage = StorageService(settings)

    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read file data
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:  # 5 MB limit
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    # Generate unique key
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() or "png"
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"
    key = f"profile_photos/{current_user.id}/{uuid.uuid4().hex}.{ext}"

    default_ct = _CONTENT_TYPES.get(ext, "image/png")
    storage.upload_bytes(data, key, content_type=file.content_type or default_ct)

    # Update profile record
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id, profile_photo_key=key)
        db.add(profile)
    else:
        # Delete old photo if exists
        if profile.profile_photo_key:
            try:
                storage.delete_object(profile.profile_photo_key)
            except Exception:
                pass
        profile.profile_photo_key = key

    db.commit()
    return {"profile_photo_key": key}


@router.get("/photo")
async def get_profile_photo(
    key: str | None = None,
):
    """Serve a profile photo. For S3, redirects to a presigned URL.
    For local storage, streams the file directly.

    Unauthenticated by design (so <img src> works without an Authorization
    header) — the key is an unguessable per-user UUID, acting as a capability
    token. But it MUST be scoped to the profile_photos/ prefix, otherwise the
    same endpoint becomes an arbitrary-object read across all storage keys
    (e.g. other users' resumes) for anyone who can guess/observe a key.
    """
    if not key:
        raise HTTPException(status_code=400, detail="Missing key parameter")
    if not key.startswith("profile_photos/") or ".." in key:
        raise HTTPException(status_code=400, detail="Invalid key")

    settings = get_settings()
    storage = StorageService(settings)

    # For S3, redirect to presigned URL (faster, works on serverless)
    if storage._backend == "s3":
        url = storage.get_presigned_url(key)
        if url:
            return RedirectResponse(url=url, status_code=302)
        raise HTTPException(status_code=404, detail="Photo not found")

    # For local storage, stream directly
    try:
        data = storage.download_bytes(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Photo not found")

    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    content_type = _CONTENT_TYPES.get(ext, "image/png")

    return StreamingResponse(iter([data]), media_type=content_type)
