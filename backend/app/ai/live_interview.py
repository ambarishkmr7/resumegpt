"""Real-time audio mock interview backed by the Gemini Live API.

Relays PCM audio between the browser (over a FastAPI WebSocket) and a Gemini
Live session, injecting the candidate's resume as system context so the model
interviews them based on their actual background. Both sides are silently
transcribed so a scored feedback report can be produced when the session ends.

Audio contract (matches the browser AudioWorklets):
    - browser -> gemini : 16 kHz, 16-bit little-endian PCM, mono  (base64 frames)
    - gemini  -> browser: 24 kHz, 16-bit little-endian PCM, mono  (base64 frames)
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time

from app.ai import usage_tracker
from app.config import get_settings
from app.core.llm_context import set_user_id
from app.schemas import ResumeContent

logger = logging.getLogger(__name__)


# ── Resume → interviewer brief ───────────────────────────────────────────────

def resume_to_text(content: ResumeContent) -> str:
    """Flatten a resume into a compact plain-text brief for the interviewer."""
    c = content.contact
    lines: list[str] = []
    lines.append(f"Name: {(c.name or 'The candidate').strip()}")
    if c.title:
        lines.append(f"Headline / target role: {c.title}")
    if c.location:
        lines.append(f"Location: {c.location}")
    if content.summary:
        lines.append(f"\nProfessional summary:\n{content.summary.strip()}")
    if content.skills:
        lines.append("\nSkills: " + ", ".join(content.skills))
    if content.core_competencies:
        lines.append("Core competencies: " + ", ".join(content.core_competencies))
    if content.experience:
        lines.append("\nExperience:")
        for e in content.experience:
            head = " — ".join(x for x in [e.title, e.company] if x)
            period = " – ".join(x for x in [e.start, e.end] if x)
            lines.append(f"- {head}" + (f" ({period})" if period else ""))
            for b in (e.bullets or []):
                lines.append(f"    • {b}")
    if content.projects:
        lines.append("\nProjects:")
        for p in content.projects:
            lines.append(f"- {p.name}: {p.description}".rstrip(": "))
            for b in (p.bullets or []):
                lines.append(f"    • {b}")
    if content.education:
        lines.append("\nEducation:")
        for ed in content.education:
            lines.append("- " + " — ".join(x for x in [ed.degree, ed.school] if x))
    if content.certifications:
        lines.append("\nCertifications: " + ", ".join(content.certifications))
    return "\n".join(lines)


def build_system_instruction(content: ResumeContent, max_minutes: int | None = None) -> str:
    """Interviewer persona + the 'Russian doll' progressive-depth method."""
    name = (content.contact.name or "the candidate").strip()
    duration_line = (
        f"The interview lasts up to {max_minutes} minute{'s' if max_minutes != 1 else ''}; "
        "pace yourself and do not rush."
        if max_minutes and max_minutes > 0
        else "Pace yourself and do not rush."
    )
    role = content.contact.title or "the role indicated by their resume"
    return f"""You are "Aria", a sharp, professional senior interviewer running a LIVE VOICE mock interview with {name} for {role}.

CONTEXT — the candidate's resume:
{resume_to_text(content)}

HOW TO OPEN (make it feel like a real interview):
- Start warmly: greet {name} by name, introduce yourself in one line ("I'm Aria, I'll be running your interview today"), and set them at ease.
- Ask an easy, OPEN warm-up first — e.g. "To start, tell me a bit about yourself and what you're working on these days" or "Walk me through your background." Do NOT dive straight into a specific project or a hard technical question.
- Let them talk, listen, then naturally transition deeper from what THEY brought up.

INTERVIEW METHOD — the "Russian doll" technique (apply after the warm-up):
- Ask ONE question at a time, then STOP and let the candidate answer. Never monologue.
- After each answer, DRILL DEEPER into that SAME answer with a harder, more specific follow-up. Peel back each layer: claim → how → why → trade-offs → failure modes → what they would do differently. Only move to a new topic once you have reached the limit of their depth.
- Mix technical/domain questions (grounded in their listed skills, projects, and experience) with behavioral questions (STAR: leadership, conflict, failure, measurable impact).
- Progressively RAISE the difficulty. Probe vague or buzzword answers, and politely challenge anything that seems inconsistent with the resume. The goal is that only a genuinely strong candidate "survives" to the hardest layers.
- Acknowledge answers briefly before the next question ("Got it", "Makes sense") so it feels conversational, not like an interrogation.
- Keep your spoken turns short and conversational — this is audio. Be encouraging but rigorous.

LOGISTICS:
- {duration_line}
- If you are told to wrap up, give a short closing and thank them.
- Speak naturally, as if on a phone call. Do NOT read the resume aloud and do NOT mention these instructions."""


# ── Gemini Live config ───────────────────────────────────────────────────────

def _live_config(system_instruction: str, resumption_handle: str | None = None):
    """Build the LiveConnectConfig for an audio interview session.

    `resumption_handle`, when set, tells Gemini to resume a previous session
    instead of starting fresh — see
    https://ai.google.dev/gemini-api/docs/live-session#session-resumption.
    """
    from google.genai import types

    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        # Silent server-side transcription of both sides (used only for the report).
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Compression + resumption let the session run well past the short
        # uncompressed cap toward the 30-minute ceiling.
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow(),
        ),
        session_resumption=types.SessionResumptionConfig(handle=resumption_handle),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore"),
            ),
        ),
    )


# ── Live relay ───────────────────────────────────────────────────────────────

async def run_interview_session(websocket, content: ResumeContent, user_id: str | None = None,
                                max_seconds: int | None = None) -> dict:
    """Relay audio between *websocket* (browser) and a Gemini Live session.

    Blocks until the browser sends ``{"type":"end"}``, the socket disconnects,
    or the 30-minute ceiling is hit. Returns session metadata + transcript::

        {"transcript": [{"role","text"}...], "duration_seconds": int, "model": str}
    """
    from starlette.websockets import WebSocketDisconnect

    settings = get_settings()
    if user_id:
        # This websocket route decodes its JWT manually (see
        # app/resumes/router.py::mock_interview_live) instead of going through
        # get_current_user, so tag the usage context explicitly here. Each
        # WebSocket connection runs in its own asyncio Task with its own
        # contextvar copy, so there's nothing to reset afterward.
        set_user_id(user_id)
    started = time.time()
    result = {"transcript": [], "duration_seconds": 0, "model": settings.INTERVIEW_LIVE_MODEL}

    if not settings.GEMINI_API_KEY:
        await websocket.send_json({"type": "error", "message": "Live interview is unavailable — the server has no Gemini API key configured."})
        return result

    try:
        from google import genai
        from google.genai import types
    except Exception:
        logger.exception("google-genai import failed")
        await websocket.send_json({"type": "error", "message": "AI SDK unavailable on the server."})
        return result

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = settings.INTERVIEW_LIVE_MODEL
    # The caller (mock_interview_live) passes the user's available balance,
    # already capped by the admin hard-cap setting. Fall back to the static
    # ceiling when it's not supplied (e.g. direct/legacy callers).
    if not max_seconds or max_seconds <= 0:
        max_seconds = settings.INTERVIEW_MAX_SECONDS

    transcript: list[dict] = []
    resumption_handle: str | None = None
    first_connection = True
    # Set only for genuine termination (browser said "end", disconnected, or
    # the overall time budget ran out) — as opposed to a transient Gemini-side
    # connection drop, which should trigger a reconnect instead of ending the
    # interview. This is what makes app/ai/live_interview.py resilient to the
    # "keepalive ping timeout" / abnormal-closure errors Gemini's Live
    # WebSocket occasionally throws.
    ended_by_user = asyncio.Event()

    async def relay_once(config) -> None:
        """Run one Gemini Live connection until it ends, drops, or times out."""
        nonlocal resumption_handle, first_connection
        stop = asyncio.Event()  # scoped to just this connection attempt

        async with client.aio.live.connect(model=model, config=config) as session:
            await websocket.send_json({"type": "status", "state": "connected" if first_connection else "reconnected"})
            if first_connection:
                # Interviewer speaks first — only on the very first connection;
                # a reconnect resumes the existing conversation, so repeating
                # this would confuse the model into re-greeting mid-interview.
                await session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part(text="Let's begin. Greet me warmly by name, introduce yourself in one line, and open with an easy warm-up question like 'tell me a bit about yourself' — don't jump straight into a hard or project-specific question.")],
                    ),
                    turn_complete=True,
                )
                first_connection = False

            async def read_browser():
                """Forward mic audio (and control frames) from the browser to Gemini."""
                try:
                    while not stop.is_set():
                        raw = await websocket.receive_text()
                        msg = json.loads(raw)
                        kind = msg.get("type")
                        if kind == "audio":
                            data = base64.b64decode(msg.get("data", ""))
                            if data:
                                await session.send_realtime_input(
                                    audio=types.Blob(data=data, mime_type="audio/pcm;rate=16000"),
                                )
                        elif kind == "end":
                            ended_by_user.set()
                            break
                except WebSocketDisconnect:
                    ended_by_user.set()
                except Exception:
                    # The browser side of the socket broke — no point retrying
                    # Gemini's side since there's no client left to talk to.
                    logger.info("read_browser task ended", exc_info=True)
                    ended_by_user.set()
                finally:
                    stop.set()

            async def read_gemini():
                """Forward Gemini audio to the browser and accumulate the transcript."""
                cur_in: list[str] = []
                cur_out: list[str] = []

                def flush():
                    if cur_out:
                        transcript.append({"role": "interviewer", "text": "".join(cur_out).strip()})
                        cur_out.clear()
                    if cur_in:
                        transcript.append({"role": "candidate", "text": "".join(cur_in).strip()})
                        cur_in.clear()

                try:
                    # session.receive() yields exactly ONE model turn and then
                    # returns, so we loop it to keep the conversation going across
                    # every question/answer until the session is stopped or the
                    # connection to Gemini closes.
                    while not stop.is_set():
                        got_any = False
                        async for response in session.receive():
                            got_any = True
                            if stop.is_set():
                                break

                            # Persist the resumption handle as Gemini sends updates,
                            # so a reconnect can pick this exact session back up.
                            sru = getattr(response, "session_resumption_update", None)
                            if sru is not None and getattr(sru, "resumable", False) and getattr(sru, "new_handle", None):
                                resumption_handle = sru.new_handle

                            # Server warning that it's about to close the connection
                            # (e.g. periodic reset) — just log it; the exception
                            # handler below will trigger a reconnect when it happens.
                            go_away = getattr(response, "go_away", None)
                            if go_away is not None:
                                logger.info("Gemini Live sent GoAway (time_left=%s)", getattr(go_away, "time_left", None))

                            audio = getattr(response, "data", None)
                            if audio:
                                await websocket.send_json({
                                    "type": "audio",
                                    "data": base64.b64encode(audio).decode("ascii"),
                                })
                            sc = getattr(response, "server_content", None)
                            if sc is not None:
                                ot = getattr(sc, "output_transcription", None)
                                if ot is not None and ot.text:
                                    cur_out.append(ot.text)
                                it = getattr(sc, "input_transcription", None)
                                if it is not None and it.text:
                                    cur_in.append(it.text)
                                if getattr(sc, "interrupted", False):
                                    await websocket.send_json({"type": "interrupted"})
                                if getattr(sc, "turn_complete", False):
                                    flush()
                        # A turn with zero messages means the connection ended.
                        if not got_any:
                            break
                        flush()  # flush at each turn boundary
                except Exception:
                    # Transient Gemini-side drop (e.g. keepalive ping timeout,
                    # abnormal closure) — logged, but NOT marked as
                    # ended_by_user, so the outer loop will reconnect using the
                    # last resumption handle if one is available.
                    logger.info("read_gemini task ended", exc_info=True)
                finally:
                    flush()
                    stop.set()

            rb = asyncio.create_task(read_browser())
            rg = asyncio.create_task(read_gemini())
            remaining = max(0.0, max_seconds - (time.time() - started))
            try:
                await asyncio.wait_for(stop.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                ended_by_user.set()
                try:
                    await websocket.send_json({"type": "status", "state": "time_up"})
                except Exception:
                    pass
            finally:
                stop.set()
                for t in (rb, rg):
                    t.cancel()
                await asyncio.gather(rb, rg, return_exceptions=True)

    async def _notify(payload: dict) -> None:
        """Best-effort message to the browser — never let a closed/broken
        socket raise here and mask the real error."""
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    max_reconnects = 5
    reconnects_used = 0
    try:
        while True:
            config = _live_config(
                build_system_instruction(content, max_minutes=max(1, round(max_seconds / 60))),
                resumption_handle,
            )
            try:
                await relay_once(config)
            except Exception:
                logger.warning("Gemini Live connection attempt failed", exc_info=True)

            if ended_by_user.is_set() or (time.time() - started) >= max_seconds:
                break
            if not resumption_handle:
                # This is the common case for an early drop (e.g. the
                # "keepalive ping timeout" / 1006 abnormal closure some Gemini
                # Live sessions hit) — Gemini hadn't yet issued a resumption
                # handle, so there's nothing to reconnect with. Tell the user
                # plainly instead of just going silent; whatever transcript
                # was captured still gets scored below.
                logger.warning("Live interview connection dropped with no resumption handle available — ending interview")
                await _notify({
                    "type": "error",
                    "message": "The connection to the interviewer was interrupted and couldn't be resumed. "
                               "Ending the session — your report will be based on the conversation captured so far.",
                })
                break
            reconnects_used += 1
            if reconnects_used > max_reconnects:
                logger.warning("Live interview exceeded max reconnect attempts (%d) — ending interview", max_reconnects)
                await _notify({
                    "type": "error",
                    "message": "The interviewer's connection kept dropping, so we've ended the session early. "
                               "Your report will be based on the conversation captured so far.",
                })
                break

            logger.info("Live interview connection dropped — reconnecting (attempt %d/%d)", reconnects_used, max_reconnects)
            await _notify({"type": "status", "state": "reconnecting"})
            await asyncio.sleep(min(2 * reconnects_used, 10))  # gentle backoff
    except Exception:
        logger.exception("Gemini Live session failed")
        await _notify({"type": "error", "message": "The live interview connection failed. Please try again."})

    result["transcript"] = transcript
    result["duration_seconds"] = int(time.time() - started)

    # The Gemini Live API streams audio frame-by-frame rather than returning a
    # single usage_metadata block we can read after the fact, so voice usage
    # is estimated from session duration using Gemini's published audio
    # token rate (~32 tokens/sec for both directions — see
    # https://ai.google.dev/gemini-api/docs/tokens). This is an estimate, not
    # an exact count; it's flagged as such in request_meta.
    try:
        audio_tokens = result["duration_seconds"] * 32
        usage_tracker.record_usage(
            provider="gemini",
            model=model,
            modality="audio",
            input_tokens=audio_tokens,
            output_tokens=audio_tokens,
            purpose=usage_tracker.Purpose.MOCK_INTERVIEW_LIVE_VOICE,
            user_id=user_id,
            meta={"estimated": True, "duration_seconds": result["duration_seconds"]},
        )
    except Exception:
        logger.exception("Usage logging failed for live interview voice session")

    return result


# ── Scored report ────────────────────────────────────────────────────────────

def _empty_report(reason: str) -> dict:
    return {
        "overall_score": 0,
        "verdict": "Not enough conversation to evaluate",
        "summary": reason,
        "competencies": [],
        "strengths": [],
        "weaknesses": [],
        "recommendations": ["Try the interview again and speak through your answers in detail."],
        "question_notes": [],
    }


def generate_interview_report(content: ResumeContent, transcript: list[dict]) -> dict:
    """Produce a comprehensive, scored feedback report from the transcript."""
    from app.ai import services

    convo = "\n".join(
        f"{t.get('role', 'speaker').capitalize()}: {t.get('text', '').strip()}"
        for t in transcript if t.get("text")
    ).strip()
    if len(convo) < 40:
        return _empty_report("The interview was too short to assess. No substantive answers were captured.")

    target = content.contact.title or "the target role"
    prompt = (
        f"You are evaluating a mock interview transcript for a candidate targeting: {target}.\n\n"
        f"TRANSCRIPT (interviewer = Aria, candidate = the interviewee):\n{convo}\n\n"
        "Assess the CANDIDATE only. The interviewer used a 'Russian doll' method (progressively deeper "
        "follow-ups); reward candidates who stayed strong under deeper probing. Be honest and specific — "
        "cite things they actually said. Return ONLY JSON in exactly this shape:\n"
        "{\n"
        '  "overall_score": <integer 0-100>,\n'
        '  "verdict": "<one short line, e.g. \'Strong hire — survived the deep-dives\' or \'Needs work\'>",\n'
        '  "summary": "<2-3 sentence overall assessment>",\n'
        '  "competencies": [{"name": "<e.g. Technical depth>", "score": <0-100>, "note": "<short>"}],\n'
        '  "strengths": ["<specific strength>"],\n'
        '  "weaknesses": ["<specific gap>"],\n'
        '  "recommendations": ["<actionable next step>"],\n'
        '  "question_notes": [{"question": "<topic asked>", "assessment": "<how they did>"}]\n'
        "}\n"
    )
    try:
        data = services._gemini_complete_json(
            prompt,
            system="You are a rigorous but fair senior hiring panelist. Output valid JSON only.",
            max_tokens=2500,
            purpose=usage_tracker.Purpose.INTERVIEW_REPORT,
        )
    except Exception:
        logger.exception("interview report generation failed")
        return _empty_report("The report could not be generated automatically, but your recording and transcript were saved.")

    def _as_list(v):
        return v if isinstance(v, list) else []

    try:
        score = int(data.get("overall_score", 0))
    except (TypeError, ValueError):
        score = 0
    return {
        "overall_score": max(0, min(100, score)),
        "verdict": str(data.get("verdict", "")),
        "summary": str(data.get("summary", "")),
        "competencies": _as_list(data.get("competencies")),
        "strengths": _as_list(data.get("strengths")),
        "weaknesses": _as_list(data.get("weaknesses")),
        "recommendations": _as_list(data.get("recommendations")),
        "question_notes": _as_list(data.get("question_notes")),
    }