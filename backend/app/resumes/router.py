import asyncio
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, Form, WebSocket
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.ai import services as ai_services
from app.ai import live_interview
from app.config import get_settings
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.database import get_db, SessionLocal
from app.models import InterviewSession, Resume, User
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
    JobListingsRequest, JobListingsResponse, JobListing,
    GenerateSampleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/resumes", tags=["resumes"])
settings = get_settings()

# Max resumes a user may keep for editing (My Resumes section).
MAX_RESUMES = 4
storage = StorageService(settings)


def _normalize_roadmap(roadmap: dict) -> dict:
    """Ensure roadmap_steps items are dicts, not plain strings.
    Handles legacy cached data where steps were stored as strings."""
    steps = roadmap.get("roadmap_steps")
    if steps and isinstance(steps, list):
        coerced = []
        for i, s in enumerate(steps):
            if isinstance(s, str):
                coerced.append({
                    "text": s,
                    "timeframe": f"Step {i + 1}",
                    "category": "Growth",
                    "explanation": "A focused action that moves you measurably toward your next career milestone.",
                })
            else:
                coerced.append(s)
        roadmap["roadmap_steps"] = coerced
    return roadmap


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
    # Limit: a user may keep at most MAX_RESUMES resumes for editing.
    existing = db.query(Resume).filter(Resume.user_id == user.id).count()
    if existing >= MAX_RESUMES:
        raise HTTPException(
            status_code=409,
            detail=f"You can keep up to {MAX_RESUMES} resumes. Delete one to create a new resume.",
        )
    r = Resume(user_id=user.id, title=payload.title, template_id=payload.template_id,
               content=payload.content.model_dump())
    r.ats_score = ats_engine.score_resume(payload.content).score
    db.add(r); db.commit(); db.refresh(r)
    logger.info("Resume created: %s (user=%s, ats=%s)", r.title, user.id, r.ats_score)
    return r


# NOTE: registered before the "/{resume_id}" catch-all below so the literal
# "/interview-sessions" path isn't captured as a resume id.
def _serialize_session(s: InterviewSession, detail: bool = False) -> dict:
    report = s.report or {}
    out = {
        "id": s.id,
        "resume_id": s.resume_id,
        "resume_title": s.resume_title,
        "model": s.model,
        "duration_seconds": s.duration_seconds,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "overall_score": report.get("overall_score"),
        "verdict": report.get("verdict"),
        "has_audio": bool(s.audio_key),
    }
    if detail:
        out["report"] = report
        out["transcript"] = s.transcript or []
        out["audio_mime"] = s.audio_mime
    return out


@router.get("/interview-sessions")
def list_interview_sessions(resume_id: str = Query(None), user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    """List past interview sessions for the user (optionally filtered by resume)."""
    q = db.query(InterviewSession).filter(InterviewSession.user_id == user.id)
    if resume_id:
        q = q.filter(InterviewSession.resume_id == resume_id)
    rows = q.order_by(InterviewSession.created_at.desc()).all()
    return [_serialize_session(s) for s in rows]


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
    # Enforce the same per-user resume cap before doing any expensive parsing.
    if db.query(Resume).filter(Resume.user_id == user.id).count() >= MAX_RESUMES:
        raise HTTPException(
            status_code=409,
            detail=f"You can keep up to {MAX_RESUMES} resumes. Delete one to import a new resume.",
        )
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
            return CareerRoadmapResponse(**_normalize_roadmap(r.career_roadmap))
        # Generate and cache
        try:
            result = _normalize_roadmap(ai_services.career_roadmap(payload.content, payload.target_role))
            r.career_roadmap = result
            db.commit()
            return CareerRoadmapResponse(**result)
        except Exception as e:
            logger.error("Career roadmap failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Roadmap failed: {e}")
    # No resume_id — just generate without caching
    try:
        result = _normalize_roadmap(ai_services.career_roadmap(payload.content, payload.target_role))
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


@router.post("/job-listings", response_model=JobListingsResponse)
def job_listings(payload: JobListingsRequest, user: User = Depends(get_current_user)):
    content = payload.content
    result = ai_services.suggest_job_listings(
        content, payload.target_role, payload.location, payload.skills
    )
    listings = [JobListing(**item) for item in result.get("listings", [])]
    return JobListingsResponse(
        listings=listings,
        linkedin_job_url=result.get("linkedin_job_url", ""),
        naukri_job_url=result.get("naukri_job_url", ""),
        indeed_job_url=result.get("indeed_job_url", ""),
        monster_url=result.get("monster_url", ""),
        shine_url=result.get("shine_url", ""),
        remote_jobs_url=result.get("remote_jobs_url", ""),
        remote_com_url=result.get("remote_com_url", ""),
        crossover_url=result.get("crossover_url", ""),
        remote_co_url=result.get("remote_co_url", ""),
    )


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


@router.post("/interview-materials")
def interview_materials(payload: dict, user: User = Depends(get_current_user)):
    """Downloadable interview learning materials + solved Q&A (text-prep mode)."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    return ai_services.interview_learning_materials(content, payload.get("role"))


@router.post("/job-agent")
def job_agent(payload: dict, user: User = Depends(get_current_user)):
    """AI job search agent."""
    content = ResumeContent.model_validate(payload.get("content", {}))
    return ai_services.ai_job_agent(content, payload.get("target_role"), payload.get("location"))


# ---------- Live Audio Mock Interview (Gemini Live) ----------

@router.websocket("/mock-interview-live/{resume_id}")
async def mock_interview_live(websocket: WebSocket, resume_id: str, token: str = Query("")):
    """Real-time audio interview. Relays PCM audio between the browser and a
    Gemini Live session seeded with the resume, then persists a recorded
    ``InterviewSession`` (transcript + scored report) for later review.

    Auth: JWT is passed as the ``token`` query param (browsers can't set the
    Authorization header on a WebSocket), so we decode it directly instead of
    reusing ``get_current_user``.
    """
    await websocket.accept()

    user_id = decode_token(token)
    if not user_id:
        await websocket.send_json({"type": "error", "message": "Authentication failed. Please sign in again."})
        await websocket.close(code=4401)
        return

    # Load the resume with a short-lived session (don't hold a DB connection for
    # the whole interview).
    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user_id).first()
        if not resume:
            await websocket.send_json({"type": "error", "message": "Resume not found."})
            await websocket.close(code=4404)
            return
        resume_title = resume.title
        try:
            content = ResumeContent.model_validate(resume.content or {})
        except Exception:
            content = ResumeContent()
    finally:
        db.close()

    started_at = datetime.utcnow()
    result = await live_interview.run_interview_session(websocket, content)
    ended_at = datetime.utcnow()

    # Report generation is a blocking LLM call — run it off the event loop.
    report = await asyncio.to_thread(
        live_interview.generate_interview_report, content, result.get("transcript", [])
    )

    session_id = None
    db = SessionLocal()
    try:
        sess = InterviewSession(
            user_id=user_id,
            resume_id=resume_id,
            resume_title=resume_title,
            model=result.get("model"),
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=result.get("duration_seconds"),
            transcript=result.get("transcript", []),
            report=report,
        )
        db.add(sess)
        db.commit()
        db.refresh(sess)
        session_id = sess.id
    except Exception:
        logger.exception("Failed to persist interview session")
        db.rollback()
    finally:
        db.close()

    try:
        await websocket.send_json({
            "type": "report",
            "data": {
                "session_id": session_id,
                "report": report,
                "duration_seconds": result.get("duration_seconds"),
            },
        })
    except Exception:
        pass
    try:
        await websocket.close()
    except Exception:
        pass


def _get_owned_session(session_id: str, user: User, db: Session) -> InterviewSession:
    s = db.query(InterviewSession).filter(
        InterviewSession.id == session_id, InterviewSession.user_id == user.id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Interview session not found")
    return s


@router.get("/interview-sessions/{session_id}")
def get_interview_session(session_id: str, user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    return _serialize_session(_get_owned_session(session_id, user, db), detail=True)


@router.post("/interview-sessions/{session_id}/audio")
async def upload_interview_audio(session_id: str, file: UploadFile = File(...),
                                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Store the recorded audio for a finished interview session."""
    s = _get_owned_session(session_id, user, db)
    data = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024 * 6  # recordings can be larger than resumes
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="Recording is too large.")
    mime = file.content_type or "audio/webm"
    ext = "webm" if "webm" in mime else ("ogg" if "ogg" in mime else "bin")
    key = f"interviews/{user.id}/{session_id}.{ext}"
    storage.upload_bytes(data, key, content_type=mime)
    s.audio_key = key
    s.audio_mime = mime
    db.commit()
    return {"ok": True, "has_audio": True}


@router.get("/interview-sessions/{session_id}/audio")
def get_interview_audio(session_id: str, request: Request, token: str = Query(""),
                        db: Session = Depends(get_db)):
    """Stream the stored interview recording back for playback, honoring HTTP
    Range requests so the <audio> element can start playing immediately and
    seek without downloading the whole recording.

    Auth: <audio src> can't set an Authorization header, so the JWT may also
    arrive as a ``token`` query param (same pattern as the live-interview WS).
    """
    user_id = decode_token(token) if token else None
    if not user_id:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            user_id = decode_token(auth[7:])
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    s = db.query(InterviewSession).filter(
        InterviewSession.id == session_id, InterviewSession.user_id == user_id
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if not s.audio_key:
        raise HTTPException(status_code=404, detail="No recording for this session.")

    mime = s.audio_mime or "audio/webm"
    total = storage.get_size(s.audio_key)

    range_header = request.headers.get("range")
    if range_header:
        try:
            spec = range_header.strip().lower().removeprefix("bytes=")
            start_s, _, end_s = spec.partition("-")
            start = int(start_s) if start_s else 0
            end = min(int(end_s), total - 1) if end_s else total - 1
        except (ValueError, IndexError):
            start, end = 0, total - 1
        chunk = storage.download_range(s.audio_key, start, end)
        return Response(
            content=chunk,
            status_code=206,
            media_type=mime,
            headers={
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(chunk)),
            },
        )

    data = storage.download_bytes(s.audio_key)
    return Response(
        content=data,
        media_type=mime,
        headers={"Accept-Ranges": "bytes", "Content-Length": str(len(data))},
    )


@router.delete("/interview-sessions/{session_id}")
def delete_interview_session(session_id: str, user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    s = _get_owned_session(session_id, user, db)
    if s.audio_key:
        storage.delete_object(s.audio_key)
    db.delete(s)
    db.commit()
    return {"ok": True}


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
    # The OTP is only echoed back in non-production for testing.
    resp = {"message": f"OTP sent to {mobile}", "expires_in": 300}
    if not settings.is_production:
        resp["demo_otp"] = otp
    return resp


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


@router.post("/send-email-otp")
def send_email_otp(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Send a 6-digit OTP to the user's resume email for job-application verification."""
    from datetime import datetime, timedelta
    from app.models import OtpVerification
    from app.email_service import send_otp_email

    email = payload.get("email", "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address required")

    otp = ai_services.generate_otp()
    expires = datetime.utcnow() + timedelta(minutes=5)

    record = OtpVerification(user_id=user.id, mobile=email, otp_code=otp, expires_at=expires)
    db.add(record)
    db.commit()

    try:
        send_otp_email(email, otp, settings)
    except Exception as e:
        logger.error("Failed to send OTP email to %s: %s", email, e)
        raise HTTPException(status_code=503, detail="Failed to send OTP email. Check SMTP settings in .env")

    return {"message": f"OTP sent to {email}", "expires_in": 300}


@router.post("/verify-email-otp")
def verify_email_otp(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify the email OTP and mark the record as used."""
    from datetime import datetime
    from app.models import OtpVerification

    email = payload.get("email", "").strip().lower()
    otp = payload.get("otp", "").strip()

    record = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.mobile == email,
            OtpVerification.otp_code == otp,
            OtpVerification.verified == False,
            OtpVerification.expires_at > datetime.utcnow(),
        )
        .order_by(OtpVerification.expires_at.desc())
        .first()
    )

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    record.verified = True
    db.commit()
    return {"verified": True, "email": email}


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
