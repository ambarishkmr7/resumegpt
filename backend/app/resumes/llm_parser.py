"""LLM-powered resume parser using Google Gemini.

Two paths:
  - PDF → uploaded to Gemini File API (native PDF understanding)
  - DOCX → text extracted locally, then sent as prompt text to Gemini

Both paths use a flat JSON schema with an example to guide the LLM.
"""
import io
import json
import logging
import time

from google import genai
from google.genai import types

from app.config import get_settings
from app.schemas import ResumeContent

logger = logging.getLogger(__name__)

_MODEL = "gemini-flash-lite-latest"
_MAX_TEXT_LENGTH = 60000

# ── Flat JSON schema (Gemini works best with simple, explicit schemas) ──
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "contact": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "title": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "location": {"type": "string"},
                "linkedin": {"type": "string"},
                "website": {"type": "string"},
            },
        },
        "summary": {"type": "string"},
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "company": {"type": "string"},
                    "location": {"type": "string"},
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "bullets": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "degree": {"type": "string"},
                    "school": {"type": "string"},
                    "location": {"type": "string"},
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "details": {"type": "string"},
                },
            },
        },
        "skills": {"type": "array", "items": {"type": "string"}},
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "bullets": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "certifications": {"type": "array", "items": {"type": "string"}},
        "languages": {"type": "array", "items": {"type": "string"}},
        "accomplishments": {"type": "array", "items": {"type": "string"}},
        "activities": {"type": "array", "items": {"type": "string"}},
        "core_competencies": {"type": "array", "items": {"type": "string"}},
        "references": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "title": {"type": "string"},
                    "company": {"type": "string"},
                    "contact": {"type": "string"},
                },
            },
        },
        "custom_sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "items": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
}

# ── Example to guide the LLM ──
_EXAMPLE = {
    "contact": {
        "name": "John Doe",
        "title": "Senior Software Engineer",
        "email": "john@example.com",
        "phone": "+1 555-123-4567",
        "location": "San Francisco, CA",
        "linkedin": "linkedin.com/in/johndoe",
        "website": "johndoe.dev",
    },
    "summary": "Experienced engineer with 8+ years building scalable distributed systems...",
    "experience": [
        {
            "title": "Senior Software Engineer",
            "company": "Tech Corp",
            "location": "San Francisco, CA",
            "start": "Jan 2021",
            "end": "Present",
            "bullets": [
                "Led migration of monolith to microservices, reducing deploy time by 60%",
                "Built real-time data pipeline processing 1M+ events/day using Kafka",
                "Mentored 4 junior engineers; 2 promoted within 18 months",
            ],
        },
        {
            "title": "Software Engineer",
            "company": "StartupXYZ",
            "location": "Remote",
            "start": "Jun 2018",
            "end": "Dec 2020",
            "bullets": [
                "Designed and implemented REST APIs serving 500K daily active users",
                "Reduced cloud costs by 35% through infrastructure optimization",
            ],
        },
    ],
    "education": [
        {
            "degree": "B.Tech Computer Science",
            "school": "IIT Bombay",
            "location": "Mumbai, India",
            "start": "2014",
            "end": "2018",
            "details": "CGPA: 8.5/10",
        },
    ],
    "skills": ["Python", "Go", "Kubernetes", "AWS", "PostgreSQL", "Redis", "Kafka", "Docker"],
    "projects": [
        {
            "name": "OpenSource CLI Tool",
            "description": "A developer productivity CLI",
            "bullets": ["10K+ GitHub stars", "Written in Rust", "500+ contributors"],
        },
    ],
    "certifications": ["AWS Solutions Architect Associate", "Certified Kubernetes Administrator"],
    "languages": ["English", "Hindi"],
    "accomplishments": ["Best Paper Award at ICML 2023", "Employee of the Year 2022"],
    "activities": ["Mentor at Code for Good", "Open source contributor"],
    "core_competencies": ["System Design", "Team Leadership", "Cloud Architecture"],
    "references": [],
    "custom_sections": [],
}


def _build_client() -> genai.Client:
    api_key = get_settings().GEMINI_API_KEY
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env to enable LLM resume parsing."
        )
    return genai.Client(api_key=api_key)


def _build_prompt() -> str:
    example_str = json.dumps(_EXAMPLE, indent=2)
    return (
        "You are an expert resume parser. Extract ALL information from the given resume "
        "and return it as structured JSON.\n\n"
        "## Rules\n"
        "- Extract EVERYTHING: contact details, summary/objective, ALL work experiences "
        "(every role), education, skills, projects, certifications, languages, "
        "accomplishments, activities, references, and any other sections.\n"
        "- For work experience: each role must be a separate entry with title, company, "
        "location, start/end dates, and individual bullet points for each achievement.\n"
        "- For education: extract degree, school, location, dates, details.\n"
        "- For projects: extract name, description, and bullet points.\n"
        "- For skills: flat list of individual skill strings.\n"
        "- For certifications/languages/accomplishments/activities: flat list of strings.\n"
        "- If a section is not present, return empty array [] or empty string "".\n"
        "- Do NOT invent or fabricate any information.\n"
        "- Return ONLY valid JSON — no markdown, no code fences, no extra text.\n\n"
        f"## Expected JSON Structure (example):\n{example_str}\n\n"
        "Now parse the following resume and return the JSON:"
    )


def _parse_pdf(client: genai.Client, file_bytes: bytes) -> ResumeContent:
    uploaded_file = None
    try:
        logger.info("Uploading PDF to Gemini File API (%d bytes)...", len(file_bytes))
        uploaded_file = client.files.upload(
            file=io.BytesIO(file_bytes),
            config=types.UploadFileConfig(mime_type="application/pdf"),
        )
        while uploaded_file.state.name == "PROCESSING":
            logger.info("Waiting for Gemini file processing...")
            time.sleep(2)
            uploaded_file = client.files.get(name=uploaded_file.name)
        if uploaded_file.state.name == "FAILED":
            raise RuntimeError("Gemini file processing failed for the uploaded PDF.")

        response = client.models.generate_content(
            model=_MODEL,
            contents=[uploaded_file, _build_prompt()],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_RESPONSE_SCHEMA,
            ),
        )
        if response.parsed is None:
            raise RuntimeError("Gemini returned no parsed content for the PDF.")
        return ResumeContent.model_validate(response.parsed)
    finally:
        if uploaded_file:
            try:
                client.files.delete(name=uploaded_file.name)
                logger.info("Deleted Gemini file: %s", uploaded_file.name)
            except Exception as e:
                logger.warning("Failed to delete Gemini file: %s", e)


def _parse_text(client: genai.Client, raw_text: str) -> ResumeContent:
    text = raw_text[:_MAX_TEXT_LENGTH]
    if len(raw_text) > _MAX_TEXT_LENGTH:
        logger.warning("Resume text truncated from %d to %d chars", len(raw_text), _MAX_TEXT_LENGTH)

    prompt = _build_prompt() + f"\n\nRESUME TEXT:\n{text}"
    response = client.models.generate_content(
        model=_MODEL,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_RESPONSE_SCHEMA,
        ),
    )
    if response.parsed is None:
        raise RuntimeError("Gemini returned no parsed content for the text.")
    return ResumeContent.model_validate(response.parsed)


def parse_resume_file(storage_key: str, filename: str, storage) -> ResumeContent:
    """Parse a resume file from storage using LLM.

    PDF → Gemini File API (native understanding)
    DOCX → local text extraction + Gemini text prompt
    """
    client = _build_client()
    name = (filename or "").lower()
    file_bytes = storage.download_bytes(storage_key)

    if name.endswith(".pdf"):
        logger.info("Parsing PDF via Gemini File API: %s", storage_key)
        return _parse_pdf(client, file_bytes)
    elif name.endswith(".docx"):
        logger.info("Parsing DOCX via text + Gemini: %s", storage_key)
        from app.resumes.parser import extract_text
        raw_text = extract_text(file_bytes, filename)
        if not raw_text.strip():
            raise ValueError("Could not extract text from DOCX file.")
        return _parse_text(client, raw_text)
    else:
        raise ValueError(f"Unsupported file type: {name}. Only .pdf and .docx are supported.")
