import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai import services as ai_services
from app.config import get_settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models import Resume, User
from app.resumes import ats as ats_engine
from app.resumes import generator
from app.resumes import parser
from app.storage import StorageService
from app.schemas import (
    ATSRequest, ATSResult, CoverLetterRequest, CoverLetterResponse,
    ResumeContent, ResumeCreate, ResumeOut, ResumeUpdate,
    SuggestRequest, SuggestResponse,
    CareerAnalysisRequest, CareerAnalysisResponse,
    CareerRoadmapRequest, CareerRoadmapResponse,
    WriteupRequest, WriteupResponse,
    RewriteRequest, RewriteResponse, RewriteVariant,
    SubscriptionStatus,
    CareerJobsRequest, CareerJobsResponse,
    GenerateSampleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/resumes", tags=["resumes"])
settings = get_settings()
storage = StorageService(settings)


def _get_owned(resume_id: str, user: User, db: Session) -> Resume:
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


@router.get("", response_model=list[ResumeOut])
def list_resumes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Resume).filter(Resume.user_id == user.id).order_by(Resume.updated_at.desc()).all()


@router.post("", response_model=ResumeOut, status_code=201)
def create_resume(payload: ResumeCreate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    r = Resume(user_id=user.id, title=payload.title, template_id=payload.template_id,
               content=payload.content.model_dump())
    r.ats_score = ats_engine.score_resume(payload.content).score
    db.add(r); db.commit(); db.refresh(r)
    logger.info("Resume created: %s (user=%s, ats=%s)", r.title, user.id, r.ats_score)
    return r


@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(resume_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_owned(resume_id, user, db)


@router.put("/{resume_id}", response_model=ResumeOut)
def update_resume(resume_id: str, payload: ResumeUpdate,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _get_owned(resume_id, user, db)
    if payload.title is not None:
        r.title = payload.title
    if payload.template_id is not None:
        r.template_id = payload.template_id
    if payload.content is not None:
        r.content = payload.content.model_dump()
        r.ats_score = ats_engine.score_resume(payload.content).score
    db.commit(); db.refresh(r)
    logger.info("Resume updated: %s (user=%s)", r.id, user.id)
    return r


@router.delete("/{resume_id}", status_code=204)
def delete_resume(resume_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _get_owned(resume_id, user, db)
    storage_key = r.storage_key
    db.delete(r); db.commit()
    logger.info("Resume deleted: %s (user=%s)", resume_id, user.id)
    # Clean up the stored file (best-effort; don't fail the request).
    if storage_key:
        storage.delete_object(storage_key)


# ---------- Upload + parse ----------

@router.post("/upload", response_model=ResumeOut, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    title: str = Form("Imported Resume"),
    template_id: str = Form("classic"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = await file.read()
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_MB}MB")

    # File type validation — check magic bytes, not just extension
    ALLOWED_MIME_MAGIC = {
        b"%PDF": "application/pdf",
        b"PK\x03\x04": "application/vnd.openxmlformats",  # docx (zip-based)
    }
    allowed_exts = {".pdf", ".docx"}
    ext = Path(file.filename or "file").suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")
    magic_ok = any(data[:len(sig)] == sig for sig in ALLOWED_MIME_MAGIC)
    if not magic_ok:
        raise HTTPException(status_code=400, detail="File content does not match a valid PDF or DOCX")

    # 1) Persist the original file to storage first (needed for LLM parsing).
    ext = Path(file.filename or "file").suffix.lower() or ".pdf"
    content_type = "application/pdf" if ext == ".pdf" else (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    # We need a key before the DB record exists; use a temp key, then rename.
    tmp_key = f"uploads/tmp-{uuid.uuid4().hex}{ext}"
    try:
        storage.upload_bytes(data, tmp_key, content_type=content_type)
    except Exception:
        logger.error("Failed to store uploaded file for parsing", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to store uploaded file")

    # 2) Parse the resume using the LLM-powered parser.
    try:
        content = parser.parse_resume(tmp_key, file.filename or "resume", storage)
    except ValueError as e:
        # Clean up stored file on parse failure
        storage.delete_object(tmp_key)
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        storage.delete_object(tmp_key)
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        storage.delete_object(tmp_key)
        logger.error("LLM parsing failed", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Resume parsing failed: {e}")

    # 3) Create the DB record.
    r = Resume(user_id=user.id, title=title, template_id=template_id,
               content=content.model_dump(), original_filename=file.filename)
    r.ats_score = ats_engine.score_resume(content).score
    db.add(r); db.commit(); db.refresh(r)

    # 4) Move the file from temp key to final key.
    try:
        final_key = f"uploads/{r.id}{ext}"
        file_bytes = storage.download_bytes(tmp_key)
        r.storage_key = storage.upload_bytes(file_bytes, final_key, content_type=content_type)
        storage.delete_object(tmp_key)
        db.commit(); db.refresh(r)
    except Exception:
        logger.warning("Failed to set final storage key for resume %s", r.id, exc_info=True)

    logger.info("Resume uploaded: %s (user=%s, file=%s, size=%d bytes, ats=%s)",
                r.id, user.id, file.filename, len(data), r.ats_score)
    return r


@router.post("/parse-reference", response_model=ResumeContent)
async def parse_reference(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Parse someone else's resume to use as a structural reference (feature #8).
    Returns parsed content without saving it."""
    data = await file.read()
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_MB}MB")

    allowed_exts = {".pdf", ".docx"}
    ext = Path(file.filename or "file").suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")

    # Store temporarily for LLM parsing
    tmp_key = f"ref-uploads/tmp-{uuid.uuid4().hex}{ext}"
    content_type = "application/pdf" if ext == ".pdf" else (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    try:
        storage.upload_bytes(data, tmp_key, content_type=content_type)
        content = parser.parse_resume(tmp_key, file.filename or "reference", storage)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        logger.error("LLM reference parsing failed", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Resume parsing failed: {e}")
    finally:
        storage.delete_object(tmp_key)

    return content


# ---------- ATS ----------

@router.post("/ats", response_model=ATSResult)
def compute_ats(payload: ATSRequest, user: User = Depends(get_current_user)):
    return ats_engine.score_resume(payload.content, payload.job_description)


# ---------- AI ----------

@router.post("/suggest", response_model=SuggestResponse)
def suggest(payload: SuggestRequest, user: User = Depends(get_current_user)):
    improved, notes = ai_services.suggest_improvements(payload.content, payload.job_description)
    return SuggestResponse(improved_content=improved, notes=notes)


@router.post("/cover-letter", response_model=CoverLetterResponse)
def cover_letter(payload: CoverLetterRequest, user: User = Depends(get_current_user)):
    text = ai_services.generate_cover_letter(
        payload.content, payload.job_title, payload.company,
        payload.job_description, payload.tone,
    )
    return CoverLetterResponse(cover_letter=text)


@router.post("/analyze", response_model=CareerAnalysisResponse)
def analyze(payload: CareerAnalysisRequest, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    # If resume_id is provided, check for cached result first
    if payload.resume_id:
        r = _get_owned(payload.resume_id, user, db)
        if r.career_analysis:
            logger.info("Returning cached career analysis for resume %s", payload.resume_id)
            return CareerAnalysisResponse(**r.career_analysis)
        # Generate and cache
        try:
            result = ai_services.analyze_career(payload.content, payload.job_description)
            r.career_analysis = result
            db.commit()
            return CareerAnalysisResponse(**result)
        except Exception as e:
            logger.error("Career analysis failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    # No resume_id — just generate without caching
    try:
        result = ai_services.analyze_career(payload.content, payload.job_description)
        return CareerAnalysisResponse(**result)
    except Exception as e:
        logger.error("Career analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")


@router.post("/roadmap", response_model=CareerRoadmapResponse)
def roadmap(payload: CareerRoadmapRequest, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    # If resume_id is provided, check for cached result first
    if payload.resume_id:
        r = _get_owned(payload.resume_id, user, db)
        if r.career_roadmap:
            logger.info("Returning cached career roadmap for resume %s", payload.resume_id)
            return CareerRoadmapResponse(**r.career_roadmap)
        # Generate and cache
        try:
            result = ai_services.career_roadmap(payload.content, payload.target_role)
            r.career_roadmap = result
            db.commit()
            return CareerRoadmapResponse(**result)
        except Exception as e:
            logger.error("Career roadmap failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Roadmap failed: {e}")
    # No resume_id — just generate without caching
    try:
        result = ai_services.career_roadmap(payload.content, payload.target_role)
        return CareerRoadmapResponse(**result)
    except Exception as e:
        logger.error("Career roadmap failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Roadmap failed: {e}")


@router.post("/writeup", response_model=WriteupResponse)
def writeup(payload: WriteupRequest, user: User = Depends(get_current_user)):
    text = ai_services.generate_writeup(payload.content, payload.purpose)
    return WriteupResponse(writeup=text)


@router.post("/rewrite", response_model=RewriteResponse)
def rewrite(payload: RewriteRequest, user: User = Depends(get_current_user)):
    variants = ai_services.rewrite_resume(payload.content, payload.job_description, payload.num_variants)
    parsed = []
    for v in variants:
        try:
            c = ResumeContent.model_validate(v.get("content", {}))
        except Exception:
            c = payload.content
        parsed.append(RewriteVariant(
            label=v.get("label", "Variant"),
            description=v.get("description", ""),
            content=c,
        ))
    return RewriteResponse(variants=parsed)


@router.post("/jobs", response_model=CareerJobsResponse)
def search_jobs(payload: CareerJobsRequest, user: User = Depends(get_current_user)):
    result = ai_services.suggest_jobs(payload.content, payload.target_role, payload.location)
    return CareerJobsResponse(**result)


@router.post("/trending-jobs")
def trending_jobs_endpoint(payload: dict, user: User = Depends(get_current_user)):
    """Return trending job roles matching the resume."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    return ai_services.trending_jobs(content)


@router.post("/generate-sample")
def generate_sample(payload: GenerateSampleRequest, user: User = Depends(get_current_user)):
    """Generate a sample resume based on job title, experience, and name."""
    content = ai_services.generate_sample_resume(payload.job_title, payload.years_experience, payload.name)
    return content


# ---------- Elite AI Features ----------

@router.post("/career-counseling")
def career_counseling(payload: dict, user: User = Depends(get_current_user)):
    """AI career counselor — ask any career question."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    question = payload.get("question", "What career advice do you have for me?")
    history = payload.get("history", [])
    return ai_services.career_counseling(content, question, history)


@router.post("/mock-interview")
def mock_interview(payload: dict, user: User = Depends(get_current_user)):
    """Generate mock interview questions tailored to the resume."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    role = payload.get("role")
    difficulty = payload.get("difficulty", "medium")
    question_count = payload.get("question_count", 55)
    category = payload.get("category", "all")
    return ai_services.mock_interview(content, role, difficulty, question_count, category)


@router.post("/rate-answer")
def rate_answer(payload: dict, user: User = Depends(get_current_user)):
    """Rate a mock interview answer with gap analysis."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    return ai_services.rate_interview_answer(
        content, payload.get("question", ""), payload.get("answer", ""),
        payload.get("role"),
    )


@router.post("/job-agent")
def job_agent(payload: dict, user: User = Depends(get_current_user)):
    """AI job search agent."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    return ai_services.ai_job_agent(content, payload.get("target_role"), payload.get("location"))


@router.post("/send-otp")
def send_otp(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Send OTP to mobile number for job application verification."""
    from datetime import datetime, timedelta
    from app.models import OtpVerification

    mobile = payload.get("mobile", "").strip()
    if not mobile or len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Valid mobile number required")

    otp = ai_services.generate_otp()
    expires = datetime.utcnow() + timedelta(minutes=5)

    record = OtpVerification(user_id=user.id, mobile=mobile, otp_code=otp, expires_at=expires)
    db.add(record); db.commit()

    # In production: integrate SMS gateway (MSG91, Twilio, etc.)
    # For now, return OTP in response (demo mode)
    return {"message": f"OTP sent to {mobile}", "demo_otp": otp, "expires_in": 300}


@router.post("/verify-otp")
def verify_otp(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify OTP for job application."""
    from datetime import datetime
    from app.models import OtpVerification

    mobile = payload.get("mobile", "").strip()
    otp = payload.get("otp", "").strip()

    record = db.query(OtpVerification).filter(
        OtpVerification.user_id == user.id,
        OtpVerification.mobile == mobile,
        OtpVerification.otp_code == otp,
        OtpVerification.verified == False,
        OtpVerification.expires_at > datetime.utcnow(),
    ).order_by(OtpVerification.created_at.desc()).first()

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    record.verified = True
    db.commit()
    return {"verified": True, "mobile": mobile}


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload a profile photo. Returns base64 data URL for embedding in resume."""
    import base64
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/jpeg")
    b64 = base64.b64encode(data).decode()
    logger.info("Photo uploaded for user %s (size=%d bytes)", user.id, len(data))
    return {"data_url": f"data:{mime};base64,{b64}"}


# ---------- Original file ----------

@router.get("/{resume_id}/original")
def get_original(resume_id: str,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Serve the originally-uploaded file (PDF or DOCX) so the UI can display
    the resume 'as it was uploaded' before any parsing/restyling."""
    r = _get_owned(resume_id, user, db)

    # Determine the storage key: use saved key or fall back to legacy path lookup.
    key = r.storage_key
    if not key:
        uploads_dir = Path(settings.STORAGE_DIR) / "uploads"
        for ext in (".pdf", ".docx"):
            if (uploads_dir / f"{r.id}{ext}").exists():
                key = f"uploads/{r.id}{ext}"
                break

    if not key:
        logger.warning("No storage key for resume %s original file", resume_id)
        raise HTTPException(status_code=404, detail="Original file not stored for this resume")

    try:
        data = storage.download_bytes(key)
    except Exception:
        logger.warning("Failed to download original file for resume %s (key=%s)", resume_id, key)
        raise HTTPException(status_code=404, detail="Original file not found in storage")

    logger.info("Serving original file for resume %s (user=%s, key=%s, size=%d)",
                resume_id, user.id, key, len(data))
    ext = Path(key).suffix.lower()
    media = "application/pdf" if ext == ".pdf" else (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return StreamingResponse(
        iter([data]), media_type=media,
        headers={"Content-Disposition": f'inline; filename="{r.original_filename or f"resume{ext}"}"'},
    )


# ---------- Download (subscription-gated) ----------

@router.get("/{resume_id}/download")
def download(resume_id: str, fmt: str = "pdf",
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check subscription
    from app.models import Subscription
    sub = db.query(Subscription).filter(Subscription.user_id == user.id, Subscription.status == "active").first()
    if not sub:
        logger.warning("Download denied — no active subscription for user %s", user.id)
        raise HTTPException(status_code=402, detail="Subscription required. One-time payment of ₹299 for lifetime access.")
    r = _get_owned(resume_id, user, db)
    content = ResumeContent.model_validate(r.content)
    safe = (r.title or "resume").replace(" ", "_")
    if fmt == "pdf":
        data = generator.render_pdf(content, r.template_id)
        media = "application/pdf"; ext = "pdf"
    elif fmt in ("docx", "doc"):
        data = generator.render_docx(content, r.template_id)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; ext = "docx"
    else:
        raise HTTPException(status_code=400, detail="fmt must be 'pdf' or 'docx'")
    logger.info("Resume downloaded: %s (user=%s, fmt=%s)", resume_id, user.id, fmt)
    return StreamingResponse(
        iter([data]), media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{safe}.{ext}"'},
    )
