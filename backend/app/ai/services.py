"""AI-powered features. Each function degrades gracefully when no API key is
set, so the app remains fully usable (just without the AI niceties)."""
import json
import logging
import re

from app.ai import client
from app.ai.usage_tracker import Purpose
from app.schemas import ResumeContent
from app.resumes.ats import score_resume
logger = logging.getLogger(__name__)


# ── Domain detection helper ─────────────────────────────────────────────────

def _detect_domain(content: ResumeContent) -> str:
    """Detect the professional domain from resume content.
    Returns one of: healthcare, engineering, education, finance, military,
    trades, creative, legal, government, tech, management, sales, research, other.
    """
    title = (content.contact.title or "").lower()
    skills = " ".join(s.lower() for s in content.skills)
    bullets = " ".join(b.lower() for e in content.experience for b in e.bullets)
    all_text = f"{title} {skills} {bullets}"

    DOMAIN_KEYWORDS = {
        "healthcare": ["nurse", "doctor", "physician", "medical", "clinical", "patient", "hospital", "health", "pharma", "pharmacist", "therapist", "surgical", "diagnosis", "treatment", "ems", "paramedic", "dental", "radiology", "lab technician", "athletic trainer", "sports medicine", "rehabilitation", "physiotherapy", "occupational therapy"],
        "military": ["military", "army", "navy", "marine", "air force", "veteran", "enlisted", "commissioned", "sergeant", "lieutenant", "captain", "commander", "corps", "battalion", "regiment", "deployment", "defense", "armed forces", "reserves"],
        "engineering": ["mechanical", "civil", "electrical", "chemical", "hvac", "piping", "structural", "automotive", "manufacturing", "quality engineer", "design engineer", "production", "maintenance engineer", "solidworks", "autocad", "catia", "ansys", "fea", "cnc", "plc", "scada", "six sigma", "lean manufacturing", "iso 9001"],
        "education": ["teacher", "professor", "lecturer", "instructor", "curriculum", "classroom", "school", "university", "college", "education", "pedagogy", "student", "lesson plan", "academic", "tutor", "principal", "dean"],
        "finance": ["accountant", "financial", "audit", "tax", "chartered", "investment", "banking", "portfolio", "risk analyst", "bloomberg", "sap fico", "tally", "gst", "ifrs", "valuation", "dcf", "m&a", "actuarial", "insurance underwriter"],
        "trades": ["electrician", "plumber", "carpenter", "welder", "mason", "hvac technician", "mechanic", "construction", "foreman", "apprentice", "journeyman", "osha", "building code"],
        "creative": ["designer", "graphic", "illustrator", "photographer", "videographer", "animator", "art director", "creative director", "ui ", "ux ", "figma", "sketch", "adobe", "brand", "visual"],
        "legal": ["lawyer", "attorney", "paralegal", "legal", "counsel", "litigation", "compliance", "regulatory", "contract", "corporate law", "judge", "barrister", "solicitor"],
        "government": ["civil service", "public sector", "municipal", "federal", "state government", "policy", "administrative", "public affairs", "diplomat", "bureaucrat"],
        "tech": ["software", "developer", "engineer", "programming", "python", "javascript", "react", "node", "java", "devops", "cloud", "aws", "docker", "kubernetes", "data scientist", "machine learning", "full stack", "frontend", "backend", "web developer", "mobile developer", "cybersecurity", "network engineer", "system administrator", "database", "api", "agile", "scrum"],
        "management": ["manager", "director", "vp ", "vice president", "head of", "chief", "ceo", "cto", "coo", "cfo", "operations manager", "general manager", "program manager", "project manager"],
        "sales": ["sales", "account executive", "business development", "bd ", "territory", "quota", "pipeline", "crm", "salesforce", "account manager", "key account"],
        "research": ["research", "scientist", "phd", "postdoc", "laboratory", "lab ", "experiment", "hypothesis", "publication", "journal", "peer review", "grant", "r&d"],
    }

    # Score each domain by counting keyword matches
    scores = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in all_text)
        if score > 0:
            scores[domain] = score

    if not scores:
        return "other"

    # Return the domain with the highest score
    return max(scores, key=scores.get)


def _domain_context(content: ResumeContent) -> str:
    """Return a brief domain description string for use in LLM prompts."""
    domain = _detect_domain(content)
    title = content.contact.title or (content.experience[0].title if content.experience else "Professional")
    domain_labels = {
        "healthcare": "Healthcare & Medical",
        "military": "Military & Defense",
        "engineering": "Engineering & Manufacturing",
        "education": "Education & Academia",
        "finance": "Finance & Accounting",
        "trades": "Skilled Trades & Construction",
        "creative": "Creative & Design",
        "legal": "Legal & Compliance",
        "government": "Government & Public Sector",
        "tech": "Technology & Software",
        "management": "Management & Leadership",
        "sales": "Sales & Business Development",
        "research": "Research & Science",
        "other": "Professional",
    }
    return f"Domain: {domain_labels.get(domain, 'Professional')} | Current role: {title}"


# ── New Gemini SDK client (replaces old REST-based client for structured output) ──

def _gemini_client():
    """Create a google-genai Client from settings."""
    from google import genai
    from app.config import get_settings
    api_key = get_settings().GEMINI_API_KEY
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    return genai.Client(api_key=api_key)


def _log_gemini_sdk_usage(response, model: str, purpose: str = None, modality: str = "text") -> None:
    """Log token usage from a native google-genai SDK response (as opposed to
    the raw REST calls in app/ai/gemini.py / app/ai/client.py). The SDK
    exposes the same fields as the REST API, just as snake_case attributes:
    response.usage_metadata.{prompt_token_count, candidates_token_count,
    cached_content_token_count, thoughts_token_count}.
    """
    from app.ai import usage_tracker
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return
    try:
        usage_tracker.record_usage(
            provider="gemini",
            model=model,
            modality=modality,
            input_tokens=getattr(usage, "prompt_token_count", 0) or 0,
            output_tokens=getattr(usage, "candidates_token_count", 0) or 0,
            cached_tokens=getattr(usage, "cached_content_token_count", 0) or 0,
            thoughts_tokens=getattr(usage, "thoughts_token_count", 0) or 0,
            purpose=purpose,
        )
    except Exception:
        logger.exception("Usage logging failed for Gemini SDK call")


def _gemini_complete_json(prompt: str, system: str = "", max_tokens: int = 2000, purpose: str = None) -> dict:
    """Send a prompt to Gemini 2.5 Flash and parse JSON response."""
    from google.genai import types
    model = "gemini-flash-lite-latest"
    client = _gemini_client()
    system_instruction = system if system else None
    response = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=max_tokens,
            temperature=0.7,
        ),
    )
    _log_gemini_sdk_usage(response, model=model, purpose=purpose)
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip().strip("`").strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


# ---------------- Cover letter ----------------

def generate_cover_letter(content: ResumeContent, job_title=None, company=None,
                          job_description=None, tone="professional") -> str:
    name = content.contact.name or "the candidate"
    if not client.available():
        # Deterministic template fallback
        top = content.experience[0] if content.experience else None
        role = job_title or (top.title if top else "the role")
        org = company or "your company"
        skills = ", ".join(content.skills[:5]) or "a strong, relevant skill set"
        return (
            f"Dear Hiring Manager,\n\n"
            f"I am writing to express my interest in the {role} position at {org}. "
            f"With a background in {role.lower()} and hands-on experience across {skills}, "
            f"I am confident I can contribute meaningfully to your team.\n\n"
            f"In my previous work I have consistently delivered measurable results, and I am "
            f"excited by the opportunity to bring that same focus to {org}. I would welcome the "
            f"chance to discuss how my experience aligns with your needs.\n\n"
            f"Thank you for your time and consideration.\n\nSincerely,\n{name}\n\n"
            f"[Generated without AI — set ANTHROPIC_API_KEY for a tailored letter.]"
        )

    system = (
        "You are an expert career writer. Write concise, specific, non-generic cover letters "
        "that reference the candidate's real achievements. Avoid clichés and filler."
    )
    prompt = (
        f"Write a {tone} cover letter (3-4 short paragraphs, ~250 words) for this candidate.\n\n"
        f"TARGET ROLE: {job_title or 'N/A'} at {company or 'the company'}\n"
        f"JOB DESCRIPTION:\n{job_description or 'N/A'}\n\n"
        f"CANDIDATE RESUME (JSON):\n{content.model_dump_json(indent=2)}\n\n"
        "Use concrete achievements from the resume. Do not invent facts. "
        "Return only the letter text, no preamble."
    )
    return client.complete(prompt, system=system, max_tokens=900, purpose=Purpose.COVER_LETTER)


# ---------------- Content suggestions / rewrite ----------------

def suggest_improvements(content: ResumeContent, job_description=None):
    notes = []
    if not client.available():
        # Use the ATS engine's suggestions as deterministic "notes".
        result = score_resume(content, job_description)
        notes = [f"[{i.category}] {i.suggestion}" for i in result.issues]
        return content, notes  # content unchanged without AI

    system = (
        "You are an expert resume editor. Improve impact and ATS-friendliness while staying "
        "truthful — never invent employers, dates, or metrics. Strengthen verbs, tighten "
        "phrasing, and add quantification ONLY where the resume implies it."
    )
    schema_hint = ResumeContent().model_dump()
    prompt = (
        "Rewrite/improve the following resume content. Return ONLY valid JSON matching this "
        f"exact schema (same keys):\n{json.dumps(schema_hint)}\n\n"
        f"TARGET JOB DESCRIPTION (optional):\n{job_description or 'N/A'}\n\n"
        f"CURRENT RESUME JSON:\n{content.model_dump_json(indent=2)}\n\n"
        "Improvements: stronger action verbs, concise quantified bullets, a crisp summary, "
        "and skills aligned to the job description. Keep all factual claims grounded in the "
        "original. Return only the JSON object."
    )
    try:
        data = client.complete_json(prompt, system=system, max_tokens=3000, purpose=Purpose.RESUME_SUGGESTIONS)
        improved = ResumeContent.model_validate(data)
        notes = ["AI rewrote bullets for impact and ATS keyword alignment."]
        return improved, notes
    except Exception as e:  # fall back safely
        return content, [f"AI suggestion failed ({e}); returned original content."]


# ---------------- Career analysis ----------------

def analyze_career(content: ResumeContent, job_description=None) -> dict:
    """Analyze a resume and return strengths, weaknesses, recommendations, and overall assessment."""
    result = score_resume(content, job_description)
    total_bullets = sum(len(e.bullets) for e in content.experience)
    quantified = sum(1 for e in content.experience for b in e.bullets if re.search(r'\d+[%$KMkm]|\d{2,}', b))

    if not client.available():
        return _deterministic_analysis(content, job_description, result, total_bullets, quantified)

    # LLM-powered analysis — domain-aware prompts
    domain_hint = _domain_context(content)
    system = (
        "You are a senior career coach and hiring expert with 15+ years of experience across ALL industries. "
        "Detect the candidate's professional domain from their resume and provide domain-appropriate analysis. "
        "Be specific, actionable, and reference actual details from the resume. Never give generic advice."
    )
    prompt = (
        f"Analyze this resume deeply. {domain_hint}\n\n"
        "Evaluate: quantified achievements, action verb usage, skill gaps relative to their field, "
        "career progression, personal branding, and resume optimization opportunities.\n\n"
        "Return a JSON object with these exact keys:\n"
        "- strengths: array of 5-6 strings (specific things done well, with evidence from resume)\n"
        "- weaknesses: array of 5-6 objects, each with: {\"text\": \"...\", \"urgency\": \"High Priority\" or \"Medium Priority\" or \"Low Priority\"}\n"
        "- recommendations: array of 8-10 objects, each with: {\"text\": \"...\", \"impact\": \"High Impact\" or \"Quick Win\" or \"Long-term\" or \"Critical\" or \"Strategic\", \"why_it_matters\": \"1-2 sentence explanation specific to this candidate\"}\n"
        "- overall_assessment: string (2-3 paragraph thorough assessment referencing their domain)\n\n"
        f"JOB DESCRIPTION (optional):\n{job_description or 'General analysis'}\n\n"
        f"RESUME JSON:\n{content.model_dump_json(indent=2)}\n\n"
        "Return ONLY the JSON object, no markdown or extra text."
    )
    try:
        data = _gemini_complete_json(prompt, system=system, max_tokens=2500, purpose=Purpose.CAREER_ANALYSIS)
        # Normalize weaknesses to always be objects with text + urgency
        raw_weaknesses = data.get("weaknesses", [])
        weaknesses = []
        for w in raw_weaknesses:
            if isinstance(w, str):
                weaknesses.append({"text": w, "urgency": "Medium Priority"})
            elif isinstance(w, dict):
                weaknesses.append({"text": w.get("text", ""), "urgency": w.get("urgency", "Medium Priority")})
        # Normalize recommendations to always be objects with text + impact + why_it_matters
        raw_recs = data.get("recommendations", [])
        recommendations = []
        for r in raw_recs:
            if isinstance(r, str):
                recommendations.append({"text": r, "impact": "Strategic", "why_it_matters": "Following this recommendation will improve your career prospects."})
            elif isinstance(r, dict):
                recommendations.append({
                    "text": r.get("text", ""),
                    "impact": r.get("impact", "Strategic"),
                    "why_it_matters": r.get("why_it_matters", "Following this recommendation will improve your career prospects."),
                })
        return dict(
            strengths=data.get("strengths", [])[:8],
            weaknesses=weaknesses[:8],
            recommendations=recommendations[:12],
            overall_assessment=data.get("overall_assessment", ""),
        )
    except Exception as e:
        logger.warning("AI career analysis failed: %s, using deterministic fallback", e)
        return _deterministic_analysis(content, job_description, result, total_bullets, quantified)


def _deterministic_analysis(content, _job_description, result, total_bullets, quantified):
    """Deterministic fallback for career analysis when AI is unavailable.
    Returns enriched objects with urgency/impact/why_it_matters."""
    domain = _detect_domain(content)
    title = content.contact.title or (content.experience[0].title if content.experience else "Professional")
    strengths, weaknesses, recs = [], [], []

    if content.experience:
        strengths.append(f"Demonstrates {len(content.experience)} role(s) of professional experience.")
    if quantified > 2:
        strengths.append(f"{quantified} bullet points include quantified achievements (numbers, %, $).")
    if content.skills and len(content.skills) >= 5:
        skills_label = "skills" if domain == "tech" else "competencies"
        strengths.append(f"Comprehensive skills section with {len(content.skills)} {skills_label} listed.")
    if content.certifications:
        strengths.append(f"Holds {len(content.certifications)} certification(s) validating expertise.")

    if not content.summary:
        weaknesses.append({"text": "Professional summary is missing or too brief — a strong summary sets the tone for your entire resume.", "urgency": "High Priority"})
    if total_bullets > 0 and quantified == 0:
        weaknesses.append({"text": "No quantified achievements found. Numbers and metrics make your impact 40% more persuasive to hiring managers.", "urgency": "High Priority"})
    if not content.certifications:
        weaknesses.append({"text": f"No certifications listed — relevant credentials in your field validate expertise and help you stand out among other {title}s.", "urgency": "Medium Priority"})

    for issue in result.issues:
        recs.append({"text": issue.suggestion, "impact": "High Impact", "why_it_matters": f"This directly addresses a gap that hiring managers in your field commonly look for."})

    recs.append({"text": f"Tailor your resume for each application: match keywords from the job description to increase your chances of passing screening.", "impact": "Critical", "why_it_matters": f"Customizing your resume for each role is one of the highest-impact actions a {title} can take."})

    return dict(
        strengths=strengths[:6] or ["Resume has basic sections filled."],
        weaknesses=weaknesses[:6] or [{"text": "No critical issues detected.", "urgency": "Low Priority"}],
        recommendations=recs[:8],
        overall_assessment=(
            f"ATS Score: {result.score}/100. "
            f"{'Excellent' if result.score >= 85 else 'Good' if result.score >= 70 else 'Needs work'} resume. "
            f"Impact evidence: {quantified}/{total_bullets} quantified bullets."
        ),
    )


def _deterministic_roadmap(content, current_title):
    """Deterministic fallback for career roadmap when AI is unavailable.
    Domain-aware: generates relevant steps based on detected professional domain."""
    from urllib.parse import quote_plus
    domain = _detect_domain(content)
    skill_query = quote_plus(current_title)

    # Domain-specific roadmap step templates
    DOMAIN_ROADMAPS = {
        "healthcare": {
            "next_roles": [f"Senior {current_title}", f"Clinical Coordinator", f"Department Manager", f"Director of {current_title}"],
            "steps": [
                {"text": f"Deepen clinical expertise and pursue advanced certifications relevant to {current_title}.", "timeframe": "Month 1-3", "category": "Credentials", "explanation": "Advanced certifications validate your expertise and are often required for senior clinical roles."},
                {"text": "Take on leadership responsibilities — lead a team, mentor junior staff, or coordinate a program.", "timeframe": "Month 2-4", "category": "Leadership", "explanation": "Demonstrating leadership in a clinical setting is essential for moving into management or director-level roles."},
                {"text": "Document measurable outcomes from your work (patient outcomes, injury reduction rates, program efficiency).", "timeframe": "Month 1-6", "category": "Portfolio", "explanation": "Quantified achievements in healthcare settings prove your impact and are critical for advancement."},
                {"text": "Network with professionals in your field through conferences, associations, and LinkedIn.", "timeframe": "Ongoing", "category": "Network", "explanation": "Healthcare hiring heavily relies on professional networks and referrals from trusted colleagues."},
                {"text": "Develop proficiency in healthcare data systems, compliance standards, and program management.", "timeframe": "Month 3-9", "category": "Skills", "explanation": "Administrative and data skills differentiate clinical practitioners who move into management roles."},
            ],
            "skill_gaps": ["Healthcare program management", "Data-driven outcome measurement", "Compliance and regulatory knowledge", "Team leadership and mentoring"],
        },
        "engineering": {
            "next_roles": [f"Senior {current_title}", f"Lead {current_title}", f"Engineering Manager", f"Principal {current_title}"],
            "steps": [
                {"text": f"Deepen technical expertise in your core engineering domain and adjacent specialties.", "timeframe": "Month 1-3", "category": "Skills", "explanation": "Technical depth is the foundation for senior engineering roles and is evaluated in every promotion review."},
                {"text": "Lead a cross-functional project from planning through delivery.", "timeframe": "Month 2-6", "category": "Leadership", "explanation": "Project leadership demonstrates your ability to coordinate teams and deliver results — key for engineering management."},
                {"text": "Earn a relevant professional certification (PE, PMP, Six Sigma, domain-specific).", "timeframe": "Month 3-9", "category": "Credentials", "explanation": "Professional certifications validate expertise and are often required for senior engineering positions."},
                {"text": "Build a portfolio of documented projects with measurable outcomes (cost savings, efficiency gains).", "timeframe": "Month 1-6", "category": "Portfolio", "explanation": "A documented portfolio of engineering achievements is your strongest tool for career advancement."},
                {"text": "Network through professional engineering associations, conferences, and industry events.", "timeframe": "Ongoing", "category": "Network", "explanation": "Engineering career advancement often depends on visibility within professional communities."},
            ],
            "skill_gaps": ["Project management", "Cross-functional leadership", "Advanced technical specialization", "Budget and resource planning"],
        },
        "education": {
            "next_roles": [f"Senior {current_title}", f"Department Head", f"Curriculum Coordinator", f"Assistant Principal"],
            "steps": [
                {"text": "Pursue advanced certifications or specialized training in your subject area or pedagogy.", "timeframe": "Month 1-4", "category": "Credentials", "explanation": "Advanced credentials open doors to senior teaching roles, curriculum design, and administrative positions."},
                {"text": "Take on mentoring responsibilities for new teachers or student teachers.", "timeframe": "Month 2-6", "category": "Leadership", "explanation": "Mentoring demonstrates leadership and is a key factor in promotion to department head or administrative roles."},
                {"text": "Document student outcomes, innovative teaching methods, and program improvements you've led.", "timeframe": "Month 1-6", "category": "Portfolio", "explanation": "Quantified educational outcomes prove your effectiveness and are essential for career advancement in education."},
                {"text": "Engage with educational communities, attend conferences, and contribute to professional development.", "timeframe": "Ongoing", "category": "Network", "explanation": "Visibility in educational communities leads to opportunities for leadership roles and specialized positions."},
                {"text": "Develop skills in educational technology, curriculum design, or administrative management.", "timeframe": "Month 3-9", "category": "Skills", "explanation": "Diversifying your skill set beyond classroom teaching opens paths to curriculum coordination and administration."},
            ],
            "skill_gaps": ["Educational technology", "Curriculum design", "Program administration", "Data-driven student assessment"],
        },
        "military": {
            "next_roles": [f"Senior {current_title}", f"Program Manager", f"Operations Manager", f"Training Director"],
            "steps": [
                {"text": "Translate military experience into civilian-equivalent skills and certifications.", "timeframe": "Month 1-3", "category": "Credentials", "explanation": "Civilian employers may not understand military roles — translating your experience is critical for a successful transition."},
                {"text": "Pursue industry certifications relevant to your target field (PMP, Six Sigma, security, logistics).", "timeframe": "Month 2-6", "category": "Credentials", "explanation": "Industry certifications bridge the gap between military and civilian career requirements."},
                {"text": "Network through veteran-friendly organizations, LinkedIn, and industry associations.", "timeframe": "Ongoing", "category": "Network", "explanation": "Veteran hiring networks and referrals are among the most effective paths to civilian employment."},
                {"text": "Develop civilian workplace skills: corporate communication, project management tools, industry-specific software.", "timeframe": "Month 1-6", "category": "Skills", "explanation": "Adapting to civilian workplace norms and tools accelerates your transition and career growth."},
                {"text": "Document measurable achievements from military service (team size, budget, operational outcomes).", "timeframe": "Month 1-3", "category": "Portfolio", "explanation": "Quantified military achievements demonstrate leadership and operational capability to civilian employers."},
            ],
            "skill_gaps": ["Civilian project management tools", "Corporate communication", "Industry-specific certifications", "Civilian workplace norms"],
        },
        "finance": {
            "next_roles": [f"Senior {current_title}", f"Finance Manager", f"Controller", f"VP of Finance"],
            "steps": [
                {"text": "Pursue advanced certifications (CPA, CFA, CA, CMA) relevant to your finance specialty.", "timeframe": "Month 1-6", "category": "Credentials", "explanation": "Advanced finance certifications are often mandatory for senior roles and significantly increase earning potential."},
                {"text": "Take on cross-functional projects involving budgeting, forecasting, or strategic planning.", "timeframe": "Month 2-6", "category": "Leadership", "explanation": "Cross-functional financial leadership experience is essential for moving into management and director roles."},
                {"text": "Develop proficiency in financial analytics tools, ERP systems, and data visualization.", "timeframe": "Month 1-4", "category": "Skills", "explanation": "Technical proficiency in financial systems differentiates candidates for senior finance positions."},
                {"text": "Build a track record of measurable financial impact (cost savings, revenue growth, process improvements).", "timeframe": "Month 1-12", "category": "Portfolio", "explanation": "Quantified financial achievements are the primary metric for advancement in finance careers."},
                {"text": "Network through finance professional associations, CFO forums, and industry events.", "timeframe": "Ongoing", "category": "Network", "explanation": "Finance hiring heavily relies on professional networks and referrals from industry peers."},
            ],
            "skill_gaps": ["Advanced financial modeling", "ERP systems (SAP/Oracle)", "Strategic planning", "Regulatory compliance"],
        },
        "tech": {
            "next_roles": [f"Senior {current_title}", f"Lead {current_title}", f"Staff {current_title}", f"Engineering Manager"],
            "steps": [
                {"text": "Deepen expertise in 1-2 core technologies and expand into adjacent areas.", "timeframe": "Month 1-3", "category": "Skills", "explanation": "Technical depth is the foundation for senior engineering roles and is evaluated in every promotion review."},
                {"text": "Take on cross-functional or leadership projects that demonstrate system-level thinking.", "timeframe": "Month 2-6", "category": "Leadership", "explanation": "Cross-team leadership and system ownership are key differentiators for staff-level promotions."},
                {"text": "Earn relevant industry certifications (cloud, security, domain-specific).", "timeframe": "Month 3-9", "category": "Credentials", "explanation": "Certifications validate expertise and help your resume pass ATS filters at top companies."},
                {"text": "Build a portfolio of measurable achievements (performance improvements, cost reductions, scale handled).", "timeframe": "Month 1-6", "category": "Portfolio", "explanation": "Quantified achievements are 40% more persuasive than vague descriptions in tech hiring."},
                {"text": "Network through tech communities, open source contributions, and conference participation.", "timeframe": "Ongoing", "category": "Network", "explanation": "70-80% of senior tech hires happen through referrals and community connections."},
            ],
            "skill_gaps": ["System design at scale", "Cross-team leadership", "Technical strategy", "Mentorship and coaching"],
        },
    }

    # Default for domains not explicitly mapped (sales, creative, legal, trades, etc.)
    default = {
        "next_roles": [f"Senior {current_title}", f"Lead {current_title}", f"{current_title} Manager", f"Director of {current_title}"],
        "steps": [
            {"text": f"Deepen expertise in your core professional domain and stay current with industry trends.", "timeframe": "Month 1-3", "category": "Skills", "explanation": "Continuous professional development is essential for staying competitive and advancing in any field."},
            {"text": "Take on leadership responsibilities — lead projects, mentor colleagues, or coordinate initiatives.", "timeframe": "Month 2-6", "category": "Leadership", "explanation": "Demonstrating leadership is the most important factor for promotion to senior and management roles."},
            {"text": "Earn relevant professional certifications or credentials in your field.", "timeframe": "Month 3-9", "category": "Credentials", "explanation": "Professional certifications validate your expertise and help you stand out from other candidates."},
            {"text": "Document measurable achievements and build a portfolio of your best work.", "timeframe": "Month 1-6", "category": "Portfolio", "explanation": "Quantified achievements prove your impact and are critical for career advancement in any profession."},
            {"text": "Network actively through professional associations, industry events, and online communities.", "timeframe": "Ongoing", "category": "Network", "explanation": "Professional networking opens doors to opportunities that are never publicly advertised."},
        ],
        "skill_gaps": ["Leadership and team management", "Strategic planning", "Industry-specific advanced skills", "Professional communication"],
    }

    roadmap = DOMAIN_ROADMAPS.get(domain, default)

    return dict(
        current_level=f"{current_title} ({domain.replace('_', ' ').title()} domain)",
        next_roles=roadmap["next_roles"],
        roadmap_steps=roadmap["steps"],
        recommended_certifications=[],
        skill_gaps=roadmap["skill_gaps"],
        timeline="6-18 months for next-level transition.",
        youtube_channels=[],
        learning_resources=[
            dict(platform="Coursera", url=f"https://www.coursera.org/search?query={skill_query}", description="University-level courses"),
            dict(platform="Udemy", url=f"https://www.udemy.com/courses/search/?q={skill_query}", description="Affordable practical courses"),
            dict(platform="LinkedIn Learning", url=f"https://www.linkedin.com/learning/search?keywords={skill_query}", description="Professional development courses"),
        ],
    )


# ---------------- Career roadmap ----------------

def career_roadmap(content: ResumeContent, target_role=None) -> dict:
    """Generate a career roadmap with certifications, skill gaps, and learning resources.
    Roadmap steps are enriched objects with timeframe, category, and explanation."""
    current_title = content.contact.title or (content.experience[0].title if content.experience else "Professional")

    if not client.available():
        return _deterministic_roadmap(content, current_title)

    # LLM-powered roadmap — domain-aware prompts
    domain_hint = _domain_context(content)
    system = (
        "You are a senior career strategist with deep expertise across ALL professional domains. "
        "Detect the candidate's field from their resume and create a domain-appropriate career roadmap. "
        "Include real certification names, real learning resources, and specific actionable steps. "
        "Every recommendation must be relevant to their actual profession — never default to tech/software advice."
    )
    prompt = (
        f"Create a detailed career roadmap. {domain_hint}\n"
        f"Target role: {target_role or 'next logical career step'}\n\n"
        f"RESUME JSON:\n{content.model_dump_json(indent=2)}\n\n"
        "Return a JSON object with these exact keys:\n"
        "- current_level: string (assessment of current career stage)\n"
        "- next_roles: array of 3-4 strings (specific next job titles in their domain)\n"
        "- roadmap_steps: array of 6-8 objects, each with: {\"text\": \"action item\", \"timeframe\": \"e.g. Month 1-3\", \"category\": \"Skills/Leadership/Credentials/Portfolio/Network/Visibility\", \"explanation\": \"2-3 sentences explaining WHY this matters for their specific career\"}\n"
        "- recommended_certifications: array of objects with keys: name, institution, description, udemy_url\n"
        "- skill_gaps: array of 4-6 strings (skills to develop for their domain)\n"
        "- timeline: string (realistic timeline for next transition)\n"
        "- youtube_channels: array of objects with keys: name, url, topic\n"
        "- learning_resources: array of objects with keys: platform, url, description\n\n"
        "Return ONLY the JSON object, no markdown or extra text."
    )
    try:
        data = _gemini_complete_json(prompt, system=system, max_tokens=3000, purpose=Purpose.CAREER_ROADMAP)
        # Normalize roadmap_steps to always be objects
        raw_steps = data.get("roadmap_steps", [])
        roadmap_steps = []
        for i, s in enumerate(raw_steps):
            if isinstance(s, str):
                roadmap_steps.append({
                    "text": s,
                    "timeframe": f"Step {i+1}",
                    "category": "Growth",
                    "explanation": "A focused action that moves you measurably toward your next career milestone.",
                })
            elif isinstance(s, dict):
                roadmap_steps.append({
                    "text": s.get("text", ""),
                    "timeframe": s.get("timeframe", f"Step {i+1}"),
                    "category": s.get("category", "Growth"),
                    "explanation": s.get("explanation", "A focused action that moves you measurably toward your next career milestone."),
                })
        return dict(
            current_level=data.get("current_level", current_title),
            next_roles=data.get("next_roles", [])[:6],
            roadmap_steps=roadmap_steps[:10],
            recommended_certifications=data.get("recommended_certifications", [])[:8],
            skill_gaps=data.get("skill_gaps", [])[:8],
            timeline=data.get("timeline", ""),
            youtube_channels=data.get("youtube_channels", [])[:10],
            learning_resources=data.get("learning_resources", [])[:10],
        )
    except Exception as e:
        logger.warning("AI career roadmap failed: %s, using deterministic fallback", e)
        return _deterministic_roadmap(content, current_title)


# ---------------- Job search / company suggestions ----------------

def suggest_jobs(content: ResumeContent, target_role=None, location=None) -> dict:
    title = content.contact.title or (content.experience[0].title if content.experience else "Software Engineer")
    target = target_role or title
    skills = ", ".join(content.skills[:8]) or "general"
    loc = location or content.contact.location or "India"
    loc_encoded = loc.replace(" ", "%20").replace(",", "%2C")
    target_encoded = target.replace(" ", "%20")
    target_slug = target.lower().replace(" ", "-")

    if not client.available():
        companies = []
        tech_companies = [
            ("Google", "World-class engineering culture, strong match for technical skills.", 4.4),
            ("Microsoft", "Large-scale systems and cloud expertise valued.", 4.2),
            ("Amazon", "Fast-paced, ownership-driven culture.", 3.9),
            ("Flipkart", "India\'s leading e-commerce, strong tech team.", 3.8),
            ("Infosys", "Large IT services with diverse project exposure.", 3.6),
            ("TCS", "Global delivery model, wide technology stack.", 3.7),
            ("Wipro", "Digital transformation and cloud services.", 3.5),
            ("Razorpay", "Fintech leader, cutting-edge payment systems.", 4.0),
            ("Swiggy", "High-scale consumer tech with real-time systems.", 3.7),
            ("Zerodha", "Lean engineering team, fintech innovation.", 4.3),
        ]
        for company, reason, gd_rating in tech_companies[:8]:
            co_slug = company.lower().replace(" ", "-")
            co_enc = company.replace(" ", "%20")
            companies.append(dict(
                company=company, role=target, match_reason=reason,
                glassdoor_rating=gd_rating,
                glassdoor_url=f"https://www.glassdoor.co.in/Reviews/{co_slug}-reviews-SRCH_KE0,{len(company)}.htm",
                linkedin_search_url=f"https://www.linkedin.com/jobs/search/?keywords={target_encoded}%20{co_enc}&location={loc_encoded}",
                naukri_search_url=f"https://www.naukri.com/{target_slug}-jobs-in-{co_slug}",
                indeed_search_url=f"https://www.indeed.co.in/jobs?q={target_encoded}+{co_enc}&l={loc_encoded}",
            ))
        return dict(
            suggestions=companies,
            linkedin_job_url=f"https://www.linkedin.com/jobs/search/?keywords={target_encoded}&location={loc_encoded}",
            naukri_job_url=f"https://www.naukri.com/{target_slug}-jobs",
            indeed_job_url=f"https://www.indeed.co.in/jobs?q={target_encoded}&l={loc_encoded}",
            remote_jobs_url=f"https://www.remotejobs.in/search?q={target_encoded}",
        )

    system = "You are a career advisor for the Indian tech market. Include Glassdoor ratings."
    prompt = (
        f"Suggest 8-10 companies for this candidate.\n"
        f"Target: {target}\nLocation: {loc}\n\n"
        f"RESUME:\n{content.model_dump_json(indent=2)}\n\n"
        "Include glassdoor_rating (1.0-5.0), glassdoor_url, linkedin_search_url, naukri_search_url, indeed_search_url.\n"
        'Return JSON: {"suggestions":[...],"linkedin_job_url":"...","naukri_job_url":"...","indeed_job_url":"...","remote_jobs_url":"..."}'
    )
    try:
        return client.complete_json(prompt, system=system, max_tokens=2500, purpose=Purpose.JOB_SUGGESTIONS)
    except Exception:
        return suggest_jobs(content, target_role, location)

# ---------------- Rich job listings ----------------

def _skill_search_url(source: str, role: str, loc: str, skills: list) -> str:
    """Build a skill-enriched search URL for each portal so clicks land on relevant results."""
    import urllib.parse
    top = skills[:2]
    combined = f"{role} {' '.join(top)}".strip() if top else role
    q = urllib.parse.quote(combined)
    l = urllib.parse.quote(loc)
    r_slug = re.sub(r"[^a-z0-9]+", "-", role.lower()).strip("-")
    l_slug = re.sub(r"[^a-z0-9]+", "-", loc.lower()).strip("-")
    if source == "LinkedIn":
        return f"https://www.linkedin.com/jobs/search/?keywords={q}&location={l}&f_TPR=r2592000&sortBy=DD"
    if source == "Naukri":
        return f"https://www.naukri.com/jobs?q={q}&l={l}&jobAge=30"
    if source == "Indeed":
        return f"https://in.indeed.com/jobs?q={q}&l={l}&fromage=30&sort=date"
    if source == "Monster":
        return f"https://www.monsterindia.com/srp/results?query={q}&locations={l}"
    if source == "Remote.com":
        return f"https://remote.com/jobs?query={q}"
    if source == "Crossover":
        return f"https://www.crossover.com/jobs?query={q}"
    if source == "Remote.co":
        return f"https://remote.co/remote-jobs/search/?search_keywords={q}"
    # Shine
    return f"https://www.shine.com/job-search/{r_slug}-jobs-in-{l_slug}/"


def suggest_job_listings(content, target_role=None, location=None, skills=None) -> dict:
    """
    Return real job listings:
    - LinkedIn: real scraped postings with actual job-view URLs
    - Naukri / Indeed / Monster / Shine: skill-enriched search cards that land
      on a pre-filtered results page matching the user's role and top skills
    Falls back to AI/deterministic listings (with fixed skill search URLs) if
    LinkedIn scraping fails.
    """
    import urllib.parse

    title = (target_role or (content.contact.title if content else None) or "Software Engineer")
    skill_list = skills or (content.skills[:10] if content else []) or []
    loc = location or (content.contact.location if content else None) or "India"

    top_skills = skill_list[:3]
    combined = f"{title} {' '.join(top_skills[:2])}".strip() if top_skills else title
    title_enc = urllib.parse.quote(title)
    loc_enc = urllib.parse.quote(loc)
    combined_enc = urllib.parse.quote(combined)
    title_slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    loc_slug = re.sub(r"[^a-z0-9]+", "-", loc.lower()).strip("-")

    # Skill-enriched "Browse All" URLs for each portal
    global_links = dict(
        linkedin_job_url=f"https://www.linkedin.com/jobs/search/?keywords={combined_enc}&location={loc_enc}&f_TPR=r2592000&sortBy=DD",
        naukri_job_url=f"https://www.naukri.com/jobs?q={combined_enc}&l={loc_enc}&jobAge=30",
        indeed_job_url=f"https://in.indeed.com/jobs?q={combined_enc}&l={loc_enc}&fromage=30&sort=date",
        monster_url=f"https://www.monsterindia.com/srp/results?query={combined_enc}&locations={loc_enc}",
        shine_url=f"https://www.shine.com/job-search/{title_slug}-jobs-in-{loc_slug}/",
        remote_jobs_url=f"https://www.remotejobs.in/search?q={title_enc}",
        remote_com_url=f"https://remote.com/jobs?query={title_enc}",
        crossover_url=f"https://www.crossover.com/jobs?query={title_enc}",
        remote_co_url=f"https://remote.co/remote-jobs/search/?search_keywords={title_enc}",
    )

    linkedin_listings = []

    # ── 1. Scrape real LinkedIn jobs ──────────────────────────────────────────
    try:
        from app import linkedin_tools

        scrape_result = linkedin_tools.search_jobs({
            "keywords": combined,
            "location": loc,
            "datePosted": "past-month",
            "sortBy": "most-recent",
            "limit": 20,
        })
        scraped = scrape_result.get("jobs", [])

        def _days_ago(s: str) -> int:
            if not s or s == "Unknown":
                return 7
            t = s.lower()
            if any(x in t for x in ("hour", "minute", "second", "just", "today")):
                return 1
            m = re.search(r"(\d+)", t)
            n = int(m.group(1)) if m else 1
            if "week" in t:
                return n * 7
            if "month" in t:
                return n * 30
            return n

        def _jtype(wp: str) -> str:
            return {"remote": "Remote", "hybrid": "Hybrid"}.get(wp, "Full-time")

        for job in scraped:
            days = _days_ago(job.get("postedTimeAgo", ""))
            if days > 45 or not job.get("url"):
                continue
            linkedin_listings.append(dict(
                job_title=job.get("title", title),
                company=job.get("company", ""),
                location=job.get("location", loc),
                job_type=_jtype(job.get("workplaceType", "")),
                experience_required="",
                skills_required=top_skills or ["Communication"],
                description=(
                    f"{job.get('title', title)} at {job.get('company', '')}. "
                    f"{job.get('location', loc)}."
                    + (" Easy Apply." if job.get("isEasyApply") else "")
                    + f" Posted {job.get('postedTimeAgo', 'recently')}."
                ),
                salary_range=job.get("salary") or "",
                source="LinkedIn",
                posted_days_ago=days,
                # Real job-specific URL — not a search query
                apply_url=job["url"],
            ))

        linkedin_listings.sort(key=lambda j: j["posted_days_ago"])
        logger.info("LinkedIn scraper returned %d jobs", len(linkedin_listings))
    except Exception as exc:
        logger.warning("LinkedIn scraping failed: %s", exc)

    # NOTE: We deliberately do NOT fabricate synthetic 'portal' job cards.
    # Listings shown to the user are real LinkedIn postings (scraped above).
    # The other portals are surfaced only as 'Browse all on' search links
    # (global_links), not as fake individual job cards.

    # Real LinkedIn results found -> return them as-is.
    if linkedin_listings:
        return dict(listings=linkedin_listings, **global_links)

    # ── 3. Fallback: AI or deterministic LinkedIn listings + portal listings ──
    logger.info("LinkedIn returned 0 results; using AI/deterministic fallback")

    fallback_companies = [
        "Google India", "Microsoft India", "Amazon India", "Flipkart",
        "Razorpay", "Swiggy", "Zerodha", "PhonePe", "Freshworks", "CRED",
        "Meesho", "Infosys", "Zomato", "Paytm", "BYJU'S",
    ]
    fb_job_types = ["Full-time", "Hybrid", "Remote", "Full-time", "Hybrid"]
    fb_salary    = ["₹10-18 LPA", "₹15-25 LPA", "₹20-35 LPA", "₹25-45 LPA", "₹30-50 LPA"]

    if not client.available():
        fb_listings = []
        for i, company in enumerate(fallback_companies):
            jtype = fb_job_types[i % len(fb_job_types)]
            fb_listings.append(dict(
                job_title=title,
                company=company,
                location="Remote" if jtype == "Remote" else loc,
                job_type=jtype,
                experience_required=exp_bands[i % len(exp_bands)],
                skills_required=skill_list[:5] or ["Communication", "Problem Solving"],
                description=(
                    f"{title} opening at {company}. Skills: {skills_str_short}."
                ),
                salary_range=fb_salary[i % len(fb_salary)],
                source="LinkedIn",
                posted_days_ago=(i % 10) + 1,
                apply_url=_skill_search_url("LinkedIn", title, loc, skill_list),
            ))
        return dict(listings=fb_listings, **global_links)

    skills_str = ", ".join(skill_list[:8]) if skill_list else "general technical skills"
    system = (
        "You are a senior recruiter with deep knowledge of the Indian job market. "
        "Generate realistic job postings. Do NOT invent apply URLs — leave apply_url as empty string."
    )
    prompt = (
        f"Generate 15 realistic job listings for:\n"
        f"- Role: {title}\n"
        f"- Location: {loc}\n"
        f"- Skills: {skills_str}\n\n"
        "Use only LinkedIn as source. Use real Indian companies.\n"
        "Salary in ₹LPA format. Set apply_url to empty string ''.\n\n"
        'Return ONLY JSON: {"listings": [{"job_title":"","company":"","location":"","job_type":"","'
        '"experience_required":"","skills_required":[],"description":"","salary_range":"","source":"LinkedIn","posted_days_ago":1,"apply_url":""}]}'
    )
    try:
        result = client.complete_json(prompt, system=system, max_tokens=4000, purpose=Purpose.JOB_LISTINGS)
        ai_listings = result.get("listings", [])
        for item in ai_listings:
            item["apply_url"] = _skill_search_url("LinkedIn", title, loc, skill_list)
        return dict(listings=ai_listings[:15], **global_links)
    except Exception:
        return dict(listings=[], **global_links)


# ---------------- Professional writeup ----------------

def generate_writeup(content: ResumeContent, purpose="linkedin") -> str:
    name = content.contact.name or "the professional"
    title = content.contact.title or (content.experience[0].title if content.experience else "Professional")
    skills = ", ".join(content.skills[:5]) or "a diverse skill set"
    exp_years = len(content.experience) * 2 if content.experience else 3

    if not client.available():
        templates = {
            "linkedin": (
                f"{name} is a {title} with {exp_years}+ years of experience. "
                f"Skilled in {skills}, they have a track record of delivering impactful results. "
                f"Currently looking for opportunities to leverage their expertise and drive innovation. "
                f"Open to connecting with professionals across the industry.\n\n"
                f"[Set ANTHROPIC_API_KEY for an AI-crafted writeup.]"
            ),
            "naukri": (
                f"{title} with {exp_years}+ years of hands-on experience in {skills}. "
                f"Proven ability to deliver projects on time. "
                f"Seeking challenging opportunities in a growth-oriented organization.\n\n"
                f"[Set ANTHROPIC_API_KEY for an AI-crafted writeup.]"
            ),
            "portfolio": (
                f"Hi, I'm {name}. I'm a {title} passionate about building great things. "
                f"With expertise in {skills}, I bring {exp_years}+ years of real-world experience.\n\n"
                f"[Set ANTHROPIC_API_KEY for an AI-crafted writeup.]"
            ),
            "bio": (
                f"{name} is a {title} specializing in {skills}. With {exp_years}+ years in the industry, "
                f"they bring deep expertise and a results-driven approach to every project.\n\n"
                f"[Set ANTHROPIC_API_KEY for an AI-crafted writeup.]"
            ),
        }
        return templates.get(purpose, templates["linkedin"])

    purpose_desc = {
        "linkedin": "a LinkedIn 'About' section (first-person, professional, 150-200 words)",
        "naukri": "a Naukri.com profile summary (third-person, formal, 100-150 words)",
        "portfolio": "a personal portfolio introduction (first-person, engaging, 100-150 words)",
        "bio": "a professional bio for conferences/articles (third-person, concise, 80-120 words)",
    }
    system = "You are an expert professional writer. Write compelling, authentic professional profiles."
    prompt = (
        f"Write {purpose_desc.get(purpose, purpose_desc['linkedin'])} for this candidate.\n\n"
        f"RESUME:\n{content.model_dump_json(indent=2)}\n\n"
        "Use their real achievements and skills. No filler or clichés. Return only the text."
    )
    return client.complete(prompt, system=system, max_tokens=600, purpose=Purpose.LINKEDIN_WRITEUP)


# ---------------- AI rewrite (multiple variants) ----------------

def rewrite_resume(content: ResumeContent, job_description=None, num_variants=3) -> list:
    if not client.available():
        # Return the original + ATS-improved as 2 variants
        result = score_resume(content, job_description)
        notes = [f"[{i.category}] {i.suggestion}" for i in result.issues[:5]]
        return [
            dict(label="Original", description="Your current resume as-is.", content=content.model_dump()),
            dict(label="ATS-Optimized", description="Suggestions applied: " + "; ".join(notes[:3]),
                 content=content.model_dump()),
        ]

    system = (
        "You are an expert resume writer. Create distinct resume variants that each take a "
        "different strategic approach. Never invent employers, dates, or metrics."
    )
    schema_hint = json.dumps(ResumeContent().model_dump())
    prompt = (
        f"Create {num_variants} distinct resume variants for this candidate.\n\n"
        f"JOB DESCRIPTION:\n{job_description or 'General improvement'}\n\n"
        f"CURRENT RESUME:\n{content.model_dump_json(indent=2)}\n\n"
        "Each variant should take a different approach:\n"
        "1. Impact-focused: emphasize metrics and achievements\n"
        "2. Skills-forward: lead with technical capabilities\n"
        "3. Narrative: tell a career story with strong transitions\n\n"
        f"Return JSON array: [{{"
        f'"label":"","description":"","content":{schema_hint}'
        f"}},...]\nReturn ONLY the JSON array."
    )
    try:
        data = client.complete_json(prompt, system=system, max_tokens=6000, purpose=Purpose.RESUME_REWRITE)
        if isinstance(data, list):
            return data[:num_variants]
        return [dict(label="AI Rewrite", description="AI-improved version.", content=data)]
    except Exception:
        return rewrite_resume(content, job_description, num_variants)


# ---------------- Sample resume generation ----------------

def generate_sample_resume(job_title: str, years_experience: int, name: str) -> dict:
    """Generate a sample resume for the given job title and experience level."""

    ROLE_SKILLS = {
        # ── Software & IT ──
        "software engineer": ["Python", "Java", "JavaScript", "React", "Node.js", "SQL", "Git", "AWS", "Docker", "REST APIs"],
        "software developer": ["Python", "Java", "JavaScript", "React", "Node.js", "SQL", "Git", "AWS", "Docker", "REST APIs"],
        "data scientist": ["Python", "TensorFlow", "PyTorch", "SQL", "Pandas", "Scikit-learn", "R", "Tableau", "AWS", "Statistics"],
        "product manager": ["Product Strategy", "Agile/Scrum", "JIRA", "User Research", "A/B Testing", "SQL", "Figma", "Roadmapping", "Stakeholder Management", "Data Analysis"],
        "devops engineer": ["Docker", "Kubernetes", "Terraform", "AWS", "CI/CD", "Jenkins", "Linux", "Ansible", "Prometheus", "Python"],
        "frontend developer": ["React", "TypeScript", "JavaScript", "HTML/CSS", "Next.js", "Vue.js", "Tailwind CSS", "Git", "REST APIs", "Figma"],
        "backend developer": ["Python", "Java", "Node.js", "PostgreSQL", "MongoDB", "Redis", "Docker", "REST APIs", "GraphQL", "AWS"],
        "full stack developer": ["React", "Node.js", "TypeScript", "Python", "PostgreSQL", "MongoDB", "Docker", "AWS", "Git", "REST APIs"],
        "cloud architect": ["AWS", "Azure", "GCP", "Terraform", "Kubernetes", "Docker", "Networking", "Security", "Microservices", "CI/CD"],
        "machine learning engineer": ["Python", "TensorFlow", "PyTorch", "Scikit-learn", "MLOps", "Docker", "AWS SageMaker", "SQL", "Computer Vision", "NLP"],
        "data analyst": ["SQL", "Python", "Excel", "Tableau", "Power BI", "R", "Statistics", "Data Visualization", "ETL", "Google Analytics"],
        "data engineer": ["Python", "Apache Spark", "Kafka", "SQL", "Airflow", "AWS", "Snowflake", "dbt", "ETL/ELT", "PostgreSQL"],
        "cybersecurity engineer": ["Network Security", "SIEM", "Penetration Testing", "Firewalls", "ISO 27001", "OWASP", "Python", "Incident Response", "Vulnerability Assessment", "Cloud Security"],
        "qa engineer": ["Selenium", "Pytest", "JIRA", "Manual Testing", "API Testing", "Postman", "CI/CD", "Test Automation", "SQL", "Agile"],
        "mobile developer": ["React Native", "Flutter", "Swift", "Kotlin", "Android SDK", "iOS SDK", "REST APIs", "Firebase", "Git", "Figma"],
        "system administrator": ["Linux", "Windows Server", "Active Directory", "VMware", "Networking", "Bash Scripting", "Ansible", "AWS", "Monitoring", "Backup & Recovery"],
        "network engineer": ["Cisco", "TCP/IP", "BGP/OSPF", "Firewalls", "VPN", "Network Monitoring", "CCNA/CCNP", "SD-WAN", "Wireshark", "Linux"],
        "ux designer": ["Figma", "Sketch", "Adobe XD", "User Research", "Wireframing", "Prototyping", "Design Systems", "A/B Testing", "HTML/CSS", "Accessibility"],
        "ui designer": ["Figma", "Adobe Illustrator", "Adobe Photoshop", "Typography", "Color Theory", "CSS", "Prototyping", "Design Systems", "HTML", "Responsive Design"],
        "business analyst": ["Requirements Gathering", "SQL", "JIRA", "Process Mapping", "Stakeholder Management", "Agile", "Power BI", "Excel", "Use Cases", "Data Analysis"],
        "project manager": ["Agile/Scrum", "JIRA", "MS Project", "Stakeholder Management", "Risk Management", "Budgeting", "PMP", "Confluence", "Communication", "Leadership"],
        # ── Mechanical / Manufacturing ──
        "mechanical engineer": ["AutoCAD", "SolidWorks", "CATIA", "ANSYS", "GD&T", "Finite Element Analysis", "Thermodynamics", "Fluid Mechanics", "Manufacturing Processes", "Lean Manufacturing"],
        "design engineer": ["SolidWorks", "AutoCAD", "CATIA", "Creo", "GD&T", "FEA/FEM", "Tolerance Analysis", "DFM/DFA", "Product Development", "FMEA"],
        "manufacturing engineer": ["Lean Manufacturing", "Six Sigma", "CNC Machining", "AutoCAD", "SolidWorks", "FMEA", "Quality Control", "Kaizen", "5S", "PLC Programming"],
        "quality engineer": ["Six Sigma", "Statistical Process Control", "FMEA", "Root Cause Analysis", "ISO 9001", "Control Plans", "Measurement Systems Analysis", "AutoCAD", "PPAP", "8D Problem Solving"],
        "production engineer": ["Lean Manufacturing", "Six Sigma", "AutoCAD", "SCADA", "PLC Programming", "5S/Kaizen", "OEE", "ERP (SAP)", "Root Cause Analysis", "ISO 9001"],
        "maintenance engineer": ["Preventive Maintenance", "PLC", "SCADA", "Hydraulics", "Pneumatics", "AutoCAD", "Vibration Analysis", "Root Cause Analysis", "SAP PM", "ISO 14001"],
        "automotive engineer": ["CATIA", "SolidWorks", "MATLAB/Simulink", "AUTOSAR", "CAN Bus", "FMEA", "ISO 26262", "Vehicle Dynamics", "Embedded C", "NVH Analysis"],
        "hvac engineer": ["HVAC Design", "AutoCAD", "Revit MEP", "HAP/Hourly Analysis", "Load Calculations", "Duct Design", "ASHRAE Standards", "Energy Modeling", "BMS", "Project Management"],
        "piping engineer": ["AutoCAD", "PDMS/E3D", "CAESAR II", "Piping Stress Analysis", "P&ID", "ASME Standards", "Material Selection", "Isometric Drawings", "PV Elite", "Navisworks"],
        # ── Civil / Structural ──
        "civil engineer": ["AutoCAD", "STAAD Pro", "ETABS", "Revit", "Total Station", "MS Project", "Primavera", "IS/BS Codes", "Site Supervision", "Quantity Estimation"],
        "structural engineer": ["STAAD Pro", "ETABS", "SAP2000", "AutoCAD", "Revit Structure", "IS 456/800", "Foundation Design", "RCC/Steel Design", "Tekla Structures", "Load Analysis"],
        "site engineer": ["AutoCAD", "Site Supervision", "Quantity Surveying", "MS Project", "BOQ Preparation", "Quality Control", "IS Codes", "Revit", "Safety Management", "Primavera"],
        "urban planner": ["GIS (ArcGIS/QGIS)", "AutoCAD", "Land Use Planning", "Zoning Regulations", "Transportation Planning", "Environmental Assessment", "Urban Design", "MS Excel", "Public Consultation", "Primavera"],
        # ── Electrical ──
        "electrical engineer": ["AutoCAD Electrical", "ETAP", "PLC Programming", "HV/LV Systems", "Power Distribution", "Switchgear Design", "Relay Protection", "IEC/IEEE Standards", "SCADA", "Load Flow Analysis"],
        "electronics engineer": ["Circuit Design", "PCB Design (Altium/KiCad)", "Embedded C", "Arduino/Raspberry Pi", "MATLAB", "Oscilloscope", "Signal Processing", "Microcontrollers", "FPGA", "EMC Testing"],
        "instrumentation engineer": ["PLC", "SCADA", "DCS", "Calibration", "P&ID", "Field Instruments", "Loop Testing", "HART Protocol", "ISA Standards", "Control System Design"],
        "power engineer": ["Power Systems Analysis", "ETAP", "PSS/E", "Relay Protection", "SCADA", "HV Transmission", "Renewable Energy", "Load Flow", "Short Circuit Analysis", "IEC Standards"],
        # ── Chemical / Process ──
        "chemical engineer": ["Aspen Plus", "HYSYS", "Process Simulation", "HAZOP", "PFD/P&ID", "Material Balances", "Reaction Engineering", "Distillation", "Safety Management", "AutoCAD"],
        "process engineer": ["Aspen Plus", "HYSYS", "PFD/P&ID", "Process Optimization", "HAZOP", "Six Sigma", "AutoCAD", "Mass & Energy Balance", "Safety & Compliance", "Root Cause Analysis"],
        # ── Medical / Healthcare ──
        "doctor": ["Clinical Diagnosis", "Patient Care", "Medical Documentation", "Evidence-Based Medicine", "Emergency Medicine", "EMR/EHR", "Pharmacology", "Surgical Assistance", "Telemedicine", "Medical Research"],
        "nurse": ["Patient Assessment", "Medication Administration", "IV Therapy", "Wound Care", "EMR/EHR", "BLS/ACLS", "Critical Care", "Patient Education", "Care Planning", "Team Collaboration"],
        "pharmacist": ["Drug Dispensing", "Clinical Pharmacy", "Drug Interaction Analysis", "Pharmacovigilance", "Inventory Management", "Patient Counseling", "Compounding", "Regulatory Compliance", "Drug Utilization Review", "Hospital Pharmacy"],
        "medical lab technician": ["Haematology", "Biochemistry", "Microbiology", "PCR Techniques", "ELISA", "Blood Bank", "Quality Control", "Lab Information Systems", "Serology", "Histopathology"],
        "biomedical engineer": ["Medical Device Design", "ISO 13485", "FDA Regulations", "LabVIEW", "MATLAB", "PCB Design", "EMC Testing", "Clinical Trials", "SolidWorks", "Signal Processing"],
        # ── Finance / Accounting ──
        "accountant": ["Tally ERP", "SAP FICO", "GST Compliance", "Financial Reporting", "MS Excel", "Tax Filing", "Accounts Payable/Receivable", "Bank Reconciliation", "Audit", "MIS Reporting"],
        "financial analyst": ["Financial Modeling", "Excel (Advanced)", "Power BI", "SQL", "Valuation (DCF/Comps)", "Bloomberg", "Python", "VBA", "Risk Analysis", "Financial Reporting"],
        "chartered accountant": ["Audit & Assurance", "Income Tax", "GST", "IFRS/Ind AS", "Tally ERP", "SAP FICO", "Financial Reporting", "Internal Controls", "Transfer Pricing", "Corporate Finance"],
        "investment banker": ["Financial Modeling", "DCF Valuation", "M&A Analysis", "Pitch Books", "Bloomberg", "Capital Markets", "Excel/PowerPoint", "Deal Structuring", "Due Diligence", "LBO Analysis"],
        "risk analyst": ["Risk Assessment", "VaR Analysis", "SQL", "Python", "Excel", "Basel III", "Credit Risk", "Stress Testing", "Power BI", "Regulatory Reporting"],
        # ── HR / Management ──
        "hr manager": ["Talent Acquisition", "Employee Relations", "HRMS (SAP/Workday)", "Performance Management", "Payroll", "Labour Law Compliance", "L&D", "HRIS", "Compensation & Benefits", "HR Analytics"],
        "recruiter": ["Talent Sourcing", "LinkedIn Recruiter", "ATS (Naukri/Workday)", "Technical Screening", "Offer Negotiation", "Employer Branding", "Boolean Search", "Stakeholder Management", "Campus Recruitment", "HR Metrics"],
        # ── Sales / Marketing ──
        "sales manager": ["Sales Strategy", "CRM (Salesforce)", "B2B Sales", "Pipeline Management", "Negotiation", "Key Account Management", "Revenue Forecasting", "Team Leadership", "MS Excel", "Market Analysis"],
        "digital marketing manager": ["Google Ads", "Meta Ads", "SEO/SEM", "Google Analytics", "Content Strategy", "Email Marketing", "HubSpot", "A/B Testing", "Social Media", "Marketing Automation"],
        "content writer": ["SEO Writing", "Content Strategy", "WordPress", "Google Analytics", "Copywriting", "Social Media", "Email Marketing", "Research", "Editing/Proofreading", "Storytelling"],
        # ── Education ──
        "teacher": ["Curriculum Development", "Lesson Planning", "Classroom Management", "Student Assessment", "LMS (Google Classroom/Moodle)", "Differentiated Instruction", "Parent Communication", "CBSE/ICSE Syllabus", "EdTech Tools", "Special Needs Education"],
        "professor": ["Research & Publication", "Curriculum Design", "Academic Writing", "Grant Writing", "MATLAB/R/Python", "Mentoring", "Peer Review", "Conference Presentations", "LMS", "Laboratory Management"],
    }

    # ── Fuzzy match job title to the closest skill set ──────────────────────
    title_lower = job_title.lower().strip()

    # Priority 1: exact match
    skills = ROLE_SKILLS.get(title_lower)

    # Priority 2: keyword-in-title match (handles "Senior Mechanical Engineer", etc.)
    if not skills:
        KEYWORD_MAP = {
            # mechanical/manufacturing
            "mechanical": "mechanical engineer", "hvac": "hvac engineer",
            "piping": "piping engineer", "automotive": "automotive engineer",
            "production": "production engineer", "maintenance": "maintenance engineer",
            "manufacturing": "manufacturing engineer", "quality": "quality engineer",
            # civil/structural
            "civil": "civil engineer", "structural": "structural engineer",
            "site engineer": "site engineer", "urban": "urban planner",
            # electrical/electronics
            "electrical": "electrical engineer", "electronics": "electronics engineer",
            "instrumentation": "instrumentation engineer", "power": "power engineer",
            # chemical/process
            "chemical": "chemical engineer", "process": "process engineer",
            # medical/healthcare
            "doctor": "doctor", "physician": "doctor", "nurse": "nurse",
            "pharmacist": "pharmacist", "pharmacy": "pharmacist",
            "biomedical": "biomedical engineer", "lab tech": "medical lab technician",
            "medical lab": "medical lab technician",
            # finance
            "account": "accountant", "financial analyst": "financial analyst",
            "chartered": "chartered accountant", "investment bank": "investment banker",
            "risk": "risk analyst",
            # IT/software
            "software": "software engineer", "developer": "software developer",
            "frontend": "frontend developer", "backend": "backend developer",
            "full stack": "full stack developer", "fullstack": "full stack developer",
            "devops": "devops engineer", "cloud": "cloud architect",
            "data scientist": "data scientist", "data analyst": "data analyst",
            "data engineer": "data engineer", "machine learning": "machine learning engineer",
            "ml engineer": "machine learning engineer", "ai engineer": "machine learning engineer",
            "cyber": "cybersecurity engineer", "security": "cybersecurity engineer",
            "qa": "qa engineer", "quality assurance": "qa engineer",
            "mobile": "mobile developer", "android": "mobile developer", "ios": "mobile developer",
            "network": "network engineer", "system admin": "system administrator",
            "sysadmin": "system administrator",
            "ux": "ux designer", "ui ": "ui designer", "product design": "ux designer",
            "business analyst": "business analyst", "product manager": "product manager",
            # hr/management
            "hr ": "hr manager", "human resource": "hr manager",
            "recruit": "recruiter", "talent": "recruiter",
            "project manager": "project manager",
            # sales/marketing
            "sales": "sales manager", "marketing": "digital marketing manager",
            "content writer": "content writer", "copywriter": "content writer",
            # education
            "teacher": "teacher", "professor": "professor", "lecturer": "professor",
        }
        for kw, mapped in KEYWORD_MAP.items():
            if kw in title_lower:
                skills = ROLE_SKILLS.get(mapped)
                break

    # Priority 3: AI-generated skills if Anthropic/Gemini available
    if not skills and client.available():
        try:
            raw = client.complete(
                f"List exactly 10 key professional skills for a '{job_title}' role in India. "
                f"Return only a JSON array of strings, no explanation.",
                system="You are a career expert. Return only a JSON array.",
                max_tokens=300,
                purpose=Purpose.RESUME_SAMPLE_GENERATION,
            )
            raw = raw.strip().lstrip("```json").rstrip("```").strip()
            import ast
            parsed = json.loads(raw) if raw.startswith("[") else ast.literal_eval(raw)
            if isinstance(parsed, list) and len(parsed) >= 5:
                skills = parsed[:10]
        except Exception:
            pass

    # Priority 4: generic professional fallback
    if not skills:
        skills = ["Communication", "Problem Solving", "MS Office", "Team Collaboration",
                  "Project Management", "Analytical Thinking", "Leadership", "Time Management",
                  "Stakeholder Management", "Continuous Learning"]

    # Generate experience entries
    experiences = []
    current_years = years_experience
    seniority = "Senior " if years_experience >= 5 else ("Lead " if years_experience >= 8 else "")

    if years_experience >= 3:
        experiences.append({
            "title": f"{seniority}{job_title}",
            "company": "Current Company",
            "location": "",
            "start": str(2025 - min(years_experience, 4)),
            "end": "Present",
            "bullets": [
                f"Lead development of core platform features serving 100K+ users",
                f"Collaborate with cross-functional teams to deliver projects on time",
                f"Mentor junior team members and conduct code reviews",
                f"Implement best practices improving code quality by 30%",
            ]
        })
        current_years -= min(years_experience, 4)

    if current_years > 0:
        experiences.append({
            "title": job_title,
            "company": "Previous Company",
            "location": "",
            "start": str(2025 - years_experience),
            "end": str(2025 - min(years_experience, 4)),
            "bullets": [
                f"Developed and maintained production applications",
                f"Reduced system downtime by 25% through proactive monitoring",
                f"Participated in agile sprints and delivered features on schedule",
            ]
        })

    DEGREE_MAP = {
        "mechanical": "Bachelor's in Mechanical Engineering",
        "civil": "Bachelor's in Civil Engineering", "structural": "Bachelor's in Civil Engineering",
        "electrical": "Bachelor's in Electrical Engineering",
        "electronics": "Bachelor's in Electronics & Communication Engineering",
        "chemical": "Bachelor's in Chemical Engineering",
        "computer": "Bachelor's in Computer Science", "software": "Bachelor's in Computer Science",
        "data": "Bachelor's in Computer Science / Statistics",
        "doctor": "MBBS", "physician": "MBBS", "nurse": "B.Sc Nursing",
        "pharmacist": "B.Pharm", "biomedical": "Bachelor's in Biomedical Engineering",
        "account": "B.Com / CA", "finance": "BBA Finance / CFA",
        "hr": "MBA – Human Resources", "recruit": "MBA – Human Resources",
        "marketing": "BBA / MBA Marketing", "sales": "BBA / MBA",
        "teacher": "B.Ed / Bachelor's in Education", "professor": "M.Tech / PhD",
    }
    degree = "Bachelor's Degree"
    for kw, deg in DEGREE_MAP.items():
        if kw in title_lower:
            degree = deg
            break

    content = {
        "contact": {"name": name, "title": job_title, "email": "", "phone": "", "location": "", "linkedin": "", "website": ""},
        "profile_photo": "",
        "summary": f"Results-driven {job_title} with {years_experience}+ years of experience. "
                   f"Skilled in {', '.join(skills[:5])} with a track record of delivering high-quality solutions. "
                   f"Passionate about continuous learning and professional excellence.",
        "experience": experiences,
        "education": [{"degree": degree, "school": "University", "location": "", "start": str(2025 - years_experience - 4), "end": str(2025 - years_experience), "details": ""}],
        "skills": skills,
        "skill_ratings": [{"name": s, "rating": 5 if i < 3 else 4 if i < 6 else 3} for i, s in enumerate(skills[:8])],
        "core_competencies": ["Problem Solving", "Team Collaboration", "Communication", "Continuous Improvement"],
        "projects": [],
        "certifications": [],
        "languages": ["English"],
        "accomplishments": [],
        "activities": [],
        "references": [],
        "custom_sections": [],
        "section_order": ["summary", "contact_info", "skill_ratings", "core_competencies",
                          "certifications", "experience", "education", "skills",
                          "accomplishments", "languages", "projects", "activities", "references"],
    }

    if client.available():
        try:
            system = "You generate realistic, professional sample resumes. Return only valid JSON."
            prompt = (
                f"Generate a complete, realistic sample resume for:\n"
                f"Name: {name}\nJob Title: {job_title}\nYears of Experience: {years_experience}\n\n"
                f"Use this JSON schema exactly: {json.dumps(content)}\n\n"
                "Fill in realistic (but fictional) company names, achievements with metrics, "
                "and relevant skills. Return ONLY the JSON object."
            )
            ai_content = client.complete_json(prompt, system=system, max_tokens=3000, purpose=Purpose.RESUME_SAMPLE_GENERATION)
            if isinstance(ai_content, dict) and "contact" in ai_content:
                # Normalize certifications: ensure each item is a string
                certs = ai_content.get("certifications", [])
                if certs and isinstance(certs[0], dict):
                    ai_content["certifications"] = [
                        f"{c.get('name', c.get('title', ''))} ({c.get('year', c.get('date', ''))})".strip(" ()")
                        if isinstance(c, dict) else str(c)
                        for c in certs
                    ]
                # Normalize references: ensure each item is a dict with name/title/company/contact
                refs = ai_content.get("references", [])
                if refs and isinstance(refs[0], str):
                    ai_content["references"] = [
                        {"name": r, "title": "", "company": "", "contact": ""}
                        if isinstance(r, str) else r
                        for r in refs
                    ]
                return ai_content
        except Exception:
            pass

    return content


# ============================================================
# ELITE FEATURES — AI-Powered Career Tools
# ============================================================


# ============================================================
# ELITE FEATURES — AI-Powered Career Tools
# ============================================================

# ---- Topic detection helpers ----
_TOPIC_KEYWORDS = {
    "salary": ["salary","pay","compensation","package","hike","ctc","offer","negotiat","lpa","lakhs"],
    "transition": ["switch","change","transition","pivot","different role","career change","move into"],
    "interview_tech": ["technical interview","coding interview","dsa","leetcode","system design interview"],
    "interview_behavioral": ["behavioral","star method","tell me about","hr interview","soft skill"],
    "interview_general": ["interview","prepare","crack","clear"],
    "skills": ["learn","skill","upskill","course","study","improve tech","technology","roadmap"],
    "companies": ["company","companies","where apply","job search","target","hiring","which firm"],
    "resume": ["resume","cv","profile","linkedin","naukri profile"],
    "certs": ["certif","credential","badge","aws cert","google cert","pmp"],
    "networking": ["network","connect","mentor","community","linkedin connections"],
    "remote": ["remote","wfh","hybrid","flexible","work from home"],
    "freelance": ["freelance","contract","consulting","self-employ","independent"],
    "leadership": ["lead","manage","manager","people management","team lead"],
    "startup": ["startup","startup vs","equity","co-found","early stage"],
    "education": ["master","mba","degree","ms","mtech","higher education","phd"],
    "layoff": ["layoff","laid off","fired","let go","unemploy","job loss","downsiz"],
    "work_life": ["burnout","stress","work life","balance","overwork","toxic"],
    "side_project": ["side project","portfolio","open source","github","contribute"],
    "international": ["abroad","visa","h1b","international","relocat","overseas","canada","us jobs"],
}

def _detect_topics(text: str) -> set:
    """Detect all topics mentioned in text."""
    t = text.lower()
    found = set()
    for topic, words in _TOPIC_KEYWORDS.items():
        if any(w in t for w in words):
            found.add(topic)
    return found

def _covered_topics(history: list) -> set:
    """Extract all topics already covered in conversation history."""
    covered = set()
    if not history:
        return covered
    for h in history:
        if h.get("role") == "assistant":
            covered |= _detect_topics(h.get("content", ""))
    return covered

def _extract_prior_advice(history: list) -> str:
    """Get a compact summary of advice already given to prevent repetition."""
    if not history:
        return ""
    advice_points = []
    for h in history:
        if h.get("role") == "assistant":
            text = h["content"]
            # Extract key sentences (first line of each paragraph)
            for para in text.split("\n\n"):
                first = para.strip().split("\n")[0]
                if first and len(first) > 15:
                    advice_points.append(first[:80])
    return "; ".join(advice_points[-10:])  # last 10 key points


# 1. Career Counseling Bot
def career_counseling(content: ResumeContent, question: str, history: list = None) -> dict:
    """AI career counselor — uses free Gemini AI primarily, with deep rule-based fallback."""
    from app.ai import gemini as gemini_client

    name = content.contact.name or "Professional"
    title = content.contact.title or "Professional"
    skills = content.skills[:10]
    skills_str = ", ".join(skills) or "your current skill set"
    exp_count = len(content.experience)
    exp_years = max(exp_count * 2, 1)
    certs = content.certifications
    latest_role = content.experience[0] if content.experience else None

    covered = _covered_topics(history)
    prior_advice = _extract_prior_advice(history)
    current_topics = _detect_topics(question)

    resume_summary = f"{name}, {title}, {exp_years}+ years, skills: {skills_str}"
    if latest_role:
        resume_summary += f", latest: {latest_role.title} at {latest_role.company}"
    if certs:
        resume_summary += f", certs: {', '.join(certs[:3])}"

    system_prompt = (
        f"You are an expert career counselor talking to {name}, a {title} with ~{exp_years} years experience.\n"
        f"Resume: {resume_summary}\n\n"
        f"CRITICAL RULES:\n"
        f"1. Give SPECIFIC advice using their actual skills ({skills_str}) and experience — never generic\n"
        f"2. NEVER repeat any advice from previous messages. Already covered: {prior_advice or 'nothing yet'}\n"
        f"3. Include concrete numbers, resources, timelines, and actionable steps\n"
        f"4. Reference real platforms (Glassdoor, Levels.fyi, LinkedIn, Naukri, etc.)\n"
        f"5. Be conversational, warm, and encouraging but practical\n"
        f"6. Keep responses focused and concise (200-300 words max)\n"
        f"7. End with exactly 3 NEW follow-up questions they haven't asked yet\n\n"
        f"Topics already discussed (DO NOT repeat these): {', '.join(covered) or 'none'}\n\n"
        f"Return valid JSON only: {{\"response\": \"your advice here\", \"suggestions\": [\"q1\", \"q2\", \"q3\"]}}"
    )

    # Build conversation
    conv = []
    if history:
        for h in history[-10:]:
            conv.append({"role": h["role"], "content": h["content"]})
    conv.append({"role": "user", "content": question})

    # === Try Gemini first (FREE) ===
    if gemini_client.available():
        try:
            text = gemini_client.chat(conv, system=system_prompt, max_tokens=1000, purpose=Purpose.CAREER_COUNSELING)
            import re as _re
            text = _re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
            try:
                result = json.loads(text)
                if isinstance(result, dict) and "response" in result:
                    # Ensure suggestions are new
                    if "suggestions" not in result or not result["suggestions"]:
                        result["suggestions"] = _gen_smart_suggestions(question, covered | current_topics, title, skills, exp_years)
                    return result
            except json.JSONDecodeError:
                pass
            return {"response": text, "suggestions": _gen_smart_suggestions(question, covered | current_topics, title, skills, exp_years)}
        except Exception as e:
            print(f"[Gemini counseling] {e}")

    # === Try Anthropic as backup ===
    if client.available():
        try:
            prompt = f"Resume: {resume_summary}\n\nQuestion: {question}"
            return client.complete_json(prompt, system=system_prompt, max_tokens=800, purpose=Purpose.CAREER_COUNSELING)
        except Exception:
            pass

    # === Smart rule-based fallback ===
    return _deep_counsel(question, name, title, skills, skills_str, exp_count, exp_years, latest_role, certs, covered, current_topics, content)


def _gen_smart_suggestions(question: str, covered: set, title: str, skills: list, exp_years: int) -> list:
    """Generate context-aware follow-up suggestions that avoid covered topics."""
    import random
    seniority = "senior" if exp_years >= 5 else "mid" if exp_years >= 2 else "junior"

    all_suggestions = [
        ("salary", f"What's the salary range for a {seniority} {title} in India?"),
        ("salary", "How do I negotiate a higher offer without losing it?"),
        ("transition", f"What roles can a {title} transition into?"),
        ("transition", "How do I switch from tech to management?"),
        ("interview_tech", f"How should I prepare for {skills[0] if skills else 'technical'} interviews?"),
        ("interview_behavioral", "What are the top behavioral interview questions?"),
        ("interview_general", "How many interviews should I do per week?"),
        ("skills", f"What skills should I add to complement {skills[0] if skills else 'my background'}?"),
        ("skills", "Should I learn AI/ML — is it worth it for my career?"),
        ("companies", f"Which companies hire {title}s with good culture?"),
        ("companies", "Startup vs. MNC — which is better for growth?"),
        ("resume", "How can I get more recruiter messages on LinkedIn?"),
        ("resume", f"Is my resume strong enough for {seniority} roles?"),
        ("certs", "Which certification gives the best salary boost?"),
        ("networking", "How do I get referred at top companies?"),
        ("remote", "How do I find high-paying remote roles from India?"),
        ("freelance", f"Can I freelance as a {title}? How much can I earn?"),
        ("leadership", "How do I move into a leadership role?"),
        ("side_project", "What side projects would boost my profile?"),
        ("international", "Should I consider working abroad?"),
        ("work_life", "How do I avoid burnout while job searching?"),
        ("layoff", "How do I recover from a layoff quickly?"),
    ]

    available = [(t, s) for t, s in all_suggestions if t not in covered]
    if not available:
        available = all_suggestions  # cycle back if all covered
    random.shuffle(available)
    return [s for _, s in available[:3]]


def _deep_counsel(question, name, title, skills, skills_str, exp_count, exp_years, latest_role, certs, covered, current_topics, content):
    """Deep rule-based career counselor with varied, specific responses."""
    q = question.lower().strip()
    seniority = "senior" if exp_years >= 5 else "mid-level" if exp_years >= 2 else "early-career"
    primary_skill = skills[0] if skills else "your primary technology"

    # SALARY / NEGOTIATION
    if "salary" in current_topics:
        if any(w in q for w in ["negotiat","how to ask","counter","hike"]):
            r = (f"**Negotiation playbook for {title}:**\n\n"
                f"**Step 1 — Research:** Check Glassdoor, Levels.fyi, AmbitionBox for {title} salaries. Filter by {exp_years}+ years and {skills[0] if skills else 'your tech stack'}.\n\n"
                f"**Step 2 — Never go first:** When asked expectations, say: \"I'd love to understand the full compensation structure and level first.\"\n\n"
                f"**Step 3 — Anchor 20% high:** If you want ₹25L, say ₹30L. They'll negotiate down to your target.\n\n"
                f"**Step 4 — Beyond base salary:** Negotiate joining bonus (₹1-5L common), RSUs/ESOPs, work flexibility, learning budget (₹50K-1L/year).\n\n"
                f"**Step 5 — Multiple offers = power:** Keep interviewing even after getting an offer. 2+ offers = 15-30% higher final package.\n\n"
                f"**Your edge:** {exp_count} role(s)" + (f", {len(certs)} cert(s) ({', '.join(certs[:2])})" if certs else "") + f" — use these as proof of expertise.")
        else:
            r = (f"**Salary landscape for {seniority} {title} ({skills_str}):**\n\n"
                f"**India ranges (2024-25):**\n"
                f"• Startups: ₹{8*exp_years}L - ₹{12*exp_years}L base + ESOPs\n"
                f"• Product cos (Flipkart/Razorpay): ₹{12*exp_years}L - ₹{18*exp_years}L total\n"
                f"• FAANG/Big Tech: ₹{18*exp_years}L - ₹{30*exp_years}L total comp\n\n"
                f"**Value multipliers:**\n"
                f"• Cloud/DevOps skills: +20-30% premium\n"
                f"• AI/ML specialization: +30-50% premium\n"
                f"• {', '.join(certs[:2]) + ' certs' if certs else 'Industry certifications'}: +10-20% premium\n\n"
                f"**Research on:** Glassdoor, Levels.fyi (for big tech), AmbitionBox (for Indian cos), Blind app (anonymous reports)")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"salary"}, title, skills, exp_years)}

    # CAREER TRANSITION
    if "transition" in current_topics:
        adjacent = {"software":["Engineering Manager","Solutions Architect","DevOps Lead","Technical Product Manager"],
                    "data":["ML Engineer","Analytics Manager","Data Platform Engineer","AI Product Manager"],
                    "product":["Engineering Manager","Startup Founder","Program Manager","Strategy"],
                    "frontend":["Full-Stack","UX Engineer","Design Systems","Mobile Developer"],
                    "backend":["Platform Engineer","SRE/DevOps","Solutions Architect","Tech Lead"]}
        domain = next((k for k in adjacent if k in title.lower()), "software")
        roles = adjacent.get(domain, adjacent["software"])
        r = (f"**Transition paths from {title}:**\n\n"
            + "\n".join(f"• **{ro}** — leverages your {skills[i%len(skills)] if skills else 'core'} background" for i,ro in enumerate(roles))
            + f"\n\n**90-day transition plan:**\n"
            f"• **Month 1:** Identify target role, take 1 relevant course (Coursera/Udemy), start networking with people in that role\n"
            f"• **Month 2:** Build 1 project demonstrating the new skill, update resume/LinkedIn with transition narrative\n"
            f"• **Month 3:** Apply to 20+ positions, lean into referrals, frame your background as a unique advantage\n\n"
            f"**Key insight:** You're not starting over — {exp_years} years of {skills_str} is a massive asset for any adjacent role.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"transition"}, title, skills, exp_years)}

    # TECHNICAL INTERVIEW
    if "interview_tech" in current_topics:
        r = (f"**Technical interview preparation for {title}:**\n\n"
            f"**DSA (2-3 weeks):**\n"
            f"• NeetCode 150 (curated LeetCode): neetcode.io — do 5/day\n"
            f"• Focus: Arrays, Trees, Graphs, DP, Sliding Window\n"
            f"• YouTube: NeetCode, Striver (take U), Abdul Bari\n\n"
            f"**System Design (2 weeks):**\n"
            f"• Book: 'DDIA' by Martin Kleppmann (the bible)\n"
            f"• YouTube: Gaurav Sen, ByteByteGo, Tech Dummies\n"
            f"• Practice: Design URL shortener, chat app, notification system\n\n"
            f"**{primary_skill} deep dive (1 week):**\n"
            f"• Internals, performance, best practices\n"
            f"• Prepare 3 project walkthroughs with metrics\n\n"
            f"**Mock interviews:** Use resumes-gpt Mock Interview, Pramp.com (free), interviewing.io")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"interview_tech"}, title, skills, exp_years)}

    # BEHAVIORAL INTERVIEW
    if "interview_behavioral" in current_topics:
        r = (f"**Behavioral interview mastery:**\n\n"
            f"**Prepare 6 STAR stories from your {exp_count} role(s):**\n"
            f"1. **Leadership** — A time you led a team/project\n"
            f"2. **Conflict** — Disagreement with colleague/manager, how you resolved it\n"
            f"3. **Failure** — Something that went wrong, what you learned\n"
            f"4. **Achievement** — Your biggest quantified impact\n"
            f"5. **Pressure** — Tight deadline, how you delivered\n"
            f"6. **Initiative** — Something you did without being asked\n\n"
            f"**STAR formula:** Situation (2 lines) → Task (1 line) → Action (3-4 lines, use 'I', not 'we') → Result (with numbers!)\n\n"
            f"**Top questions to prepare:**\n"
            f"• 'Tell me about yourself' — 2-min pitch: past→present→future\n"
            f"• 'Why are you leaving?' — Growth-focused, never badmouth\n"
            f"• 'Where do you see yourself in 3 years?' — Show ambition + realism")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"interview_behavioral"}, title, skills, exp_years)}

    # GENERAL INTERVIEW
    if "interview_general" in current_topics:
        r = (f"**Interview prep strategy for {title}:**\n\n"
            f"**Timeline:** 4-6 weeks of focused prep\n"
            f"• Week 1-2: DSA fundamentals + STAR stories\n"
            f"• Week 3-4: System design + {primary_skill} deep dive\n"
            f"• Week 5-6: Mock interviews (2-3/week) + company research\n\n"
            f"**Day before:** Review your resume, research the company's blog/tech stack, prepare 3 questions to ask them\n\n"
            f"**Day of:** Arrive 10 min early, bring water, take 3 deep breaths. Remember — they WANT you to succeed.\n\n"
            f"**After:** Send thank-you email within 24 hours. If rejected, ask for feedback (50% will respond).")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"interview_general"}, title, skills, exp_years)}

    # SKILLS / UPSKILLING
    if "skills" in current_topics:
        recs = {"python":["FastAPI/Django","Data Engineering (Spark, Airflow)","ML/AI (TensorFlow, LangChain)"],
                "java":["Spring Boot microservices","Kubernetes/Docker","Apache Kafka/event-driven"],
                "javascript":["TypeScript (essential)","Next.js/Remix","Node.js backend"],
                "react":["TypeScript","Next.js/Server Components","Testing (Vitest, Playwright)"],
                "aws":["Kubernetes (EKS/CKA)","Terraform/IaC","Security & Cost Optimization"],
                "docker":["Kubernetes","CI/CD (GitHub Actions)","Observability (Prometheus/Grafana)"]}
        primary = skills[0].lower() if skills else "programming"
        skill_recs = recs.get(primary, ["System Design","Cloud (AWS/GCP)","CI/CD"])
        r = (f"**Skill upgrade roadmap for {title}:**\n\n"
            f"**Based on your {skills_str} background, learn:**\n"
            + "\n".join(f"• **{s}** — high demand, complements your profile" for s in skill_recs)
            + f"\n\n**Strategy:** Pick ONE skill. Dedicate 1 hour/day for 4-6 weeks. Build a real project. Write about it on LinkedIn.\n\n"
            f"**Free resources:**\n"
            f"• YouTube: Fireship (quick concepts), Traversy Media (projects), freeCodeCamp (full courses)\n"
            f"• Practice: HackerRank, LeetCode, Exercism.io\n\n"
            f"**Paid (worth it):**\n"
            f"• Udemy (₹400 on sale), Coursera (audit for free, pay for cert), Scaler Academy (mentorship)")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"skills"}, title, skills, exp_years)}

    # JOB SEARCH / COMPANIES
    if "companies" in current_topics:
        r = (f"**Job search strategy for {title}:**\n\n"
            f"**Build a target list of 30 companies:**\n"
            f"• Tier 1 (dream): Google, Microsoft, Amazon, Meta — high bar, high reward\n"
            f"• Tier 2 (great): Flipkart, Razorpay, Atlassian, Uber, Swiggy — strong eng culture\n"
            f"• Tier 3 (solid): Well-funded startups, consulting firms, tech-forward enterprises\n\n"
            f"**Apply smart, not just hard:**\n"
            f"• LinkedIn: Set 'Open to Work' (visible to recruiters only)\n"
            f"• Naukri: Update profile weekly (bumps visibility)\n"
            f"• **Referrals are 5x more effective** — message 2nd-degree connections\n"
            f"• Apply within 48 hours of a posting (early applicants get 3x more callbacks)\n"
            f"• Customize your resume per application using resumes-gpt AI Rewrite\n\n"
            f"**Track everything:** Spreadsheet with company, role, date applied, status, follow-up date")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"companies"}, title, skills, exp_years)}

    # RESUME
    if "resume" in current_topics:
        bullet_count = sum(len(e.bullets) for e in (content.experience or []))
        metrics_count = sum(1 for e in (content.experience or []) for b in e.bullets if any(c.isdigit() for c in b))
        m_pct = int(metrics_count / max(bullet_count, 1) * 100)
        r = (f"**Resume analysis for {name}:**\n\n"
            f"**Stats:** {exp_count} roles, {len(skills)} skills, {len(certs)} certs, {bullet_count} bullets ({m_pct}% with metrics)\n\n"
            f"**Quick wins (do today):**\n"
            f"• Add numbers to at least 60% of bullets (currently {m_pct}%)\n"
            f"• Replace weak verbs ('responsible for', 'worked on') → power verbs ('led', 'built', 'reduced')\n"
            f"• Use resumes-gpt AI Improve for instant enhancement\n\n"
            f"**LinkedIn optimization:**\n"
            f"• Headline: '{title} | {skills[0] if skills else 'Tech'} | Open to opportunities'\n"
            f"• About: Use resumes-gpt Professional Writeup generator\n"
            f"• Post 1-2x/week about your work — even short insights get engagement")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"resume"}, title, skills, exp_years)}

    # CERTIFICATIONS
    if "certs" in current_topics:
        c_map = {"aws":["AWS Solutions Architect Associate","AWS Developer Associate"],
                 "cloud":["Google Cloud Professional","Azure Administrator"],
                 "python":["Google TensorFlow Developer","AWS ML Specialty"],
                 "data":["Google Data Analytics","Databricks Certified"],
                 "devops":["CKA (Kubernetes)","HashiCorp Terraform Associate"],
                 "java":["Oracle Java SE","Spring Professional"]}
        matched = []
        for s in [sk.lower() for sk in skills]:
            for key, val in c_map.items():
                if key in s:
                    matched.extend(val)
        if not matched:
            matched = ["AWS Cloud Practitioner (easiest entry)","Google IT Support (free on Coursera)","CKA (hot in market)"]
        r = (f"**Certifications for {title}:**\n\n"
            f"**Top picks for your profile:**\n"
            + "\n".join(f"• **{c}**" for c in list(dict.fromkeys(matched))[:4])
            + f"\n\n**Study plan:** 1-2 hours/day for 4-6 weeks. Use official docs + Udemy course (₹400 on sale).\n\n"
            f"**ROI:** Certifications add 10-20% to salary offers and make your resume pass ATS filters.\n\n"
            f"**Free prep:** AWS Skill Builder, Google Cloud Skills Boost, Microsoft Learn — all free tiers available.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"certs"}, title, skills, exp_years)}

    # NETWORKING
    if "networking" in current_topics:
        r = (f"**Networking strategy for {title}:**\n\n"
            f"**LinkedIn (most important):**\n"
            f"• Connect with 5 new people/week (personalize every request)\n"
            f"• Comment thoughtfully on posts by leaders in {primary_skill}\n"
            f"• Post 1-2x/week: project learnings, tech opinions, career reflections\n\n"
            f"**Find mentors:**\n"
            f"• ADPList.org — free 1:1 mentoring from industry professionals\n"
            f"• Message people 1-2 levels above you (\"I admire your work in X, can I ask you 2 questions?\")\n\n"
            f"**Communities:** Dev.to, Hashnode, local meetups, Discord/Slack groups for {skills[0] if skills else 'your tech'}\n\n"
            f"**Golden rule:** Give before you ask. Share knowledge, help others, build genuine relationships.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"networking"}, title, skills, exp_years)}

    # REMOTE WORK
    if "remote" in current_topics:
        r = (f"**Remote job strategy for {title}:**\n\n"
            f"**Platforms:**\n"
            f"• India: RemoteJobs.in, Naukri (filter WFH), LinkedIn (filter Remote)\n"
            f"• International: We Work Remotely, FlexJobs, Turing, Toptal, Arc.dev\n\n"
            f"**International remote = 2-5x salary:**\n"
            f"• US companies hiring remote in India: $30-80K/year for {title}\n"
            f"• Target US West Coast & EU companies (time zone overlap)\n\n"
            f"**Must-have skills for remote:** Async communication, written docs over meetings, "
            f"self-management, reliable internet + good setup")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"remote"}, title, skills, exp_years)}

    # FREELANCE
    if "freelance" in current_topics:
        r = (f"**Freelancing as a {title}:**\n\n"
            f"**Platforms:** Upwork, Toptal (premium), Fiverr Pro, Freelancer.com\n"
            f"**Rates:** ₹1000-5000/hr India clients, $40-150/hr international clients\n\n"
            f"**Getting started:**\n"
            f"1. Build a portfolio (3-5 projects)\n"
            f"2. Start on Upwork — take 2-3 small gigs at lower rates to build reviews\n"
            f"3. Specialize ('{primary_skill} freelancer' > 'full-stack freelancer')\n"
            f"4. Gradually increase rates after 10+ positive reviews\n\n"
            f"**Tip:** Keep a part-time job while building freelance income. Full independence takes 6-12 months.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"freelance"}, title, skills, exp_years)}

    # LEADERSHIP
    if "leadership" in current_topics:
        r = (f"**Moving into leadership from {title}:**\n\n"
            f"**Start now (even without the title):**\n"
            f"• Volunteer to lead a project or feature\n"
            f"• Mentor 1-2 junior developers\n"
            f"• Run tech talks or knowledge-sharing sessions\n"
            f"• Write design docs and get buy-in from stakeholders\n\n"
            f"**Build the skills:**\n"
            f"• Read: 'The Manager's Path' by Camille Fournier\n"
            f"• Course: 'Engineering Management' on Coursera\n"
            f"• Practice: 1:1 conversations, giving feedback, delegating\n\n"
            f"**Timeline:** IC → Tech Lead (1-2 years) → Engineering Manager (2-3 years)")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"leadership"}, title, skills, exp_years)}

    # LAYOFF
    if "layoff" in current_topics:
        r = (f"**Recovering from a layoff:**\n\n"
            f"**Week 1: Stabilize**\n"
            f"• File for any severance/benefits owed\n"
            f"• Update LinkedIn immediately — '#OpenToWork' gets 40% more recruiter views\n"
            f"• Tell your network — people WANT to help. Post: 'I'm exploring new opportunities as a {title}'\n\n"
            f"**Week 2-3: Prepare**\n"
            f"• Use resumes-gpt to refresh your resume with latest achievements\n"
            f"• Prepare 5 STAR stories and practice interviews\n\n"
            f"**Week 4+: Execute**\n"
            f"• Apply to 10-15 roles/week (quality > quantity)\n"
            f"• Prioritize referrals (3x higher success rate)\n\n"
            f"**Remember:** A layoff is not a reflection of your skills. Markets shift, companies restructure. Your {exp_years}+ years of experience is still valuable.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"layoff"}, title, skills, exp_years)}

    # WORK-LIFE BALANCE
    if "work_life" in current_topics:
        r = (f"**Managing burnout and work-life balance:**\n\n"
            f"**Signs to watch:** Constant fatigue, dreading work, declining quality, irritability\n\n"
            f"**Immediate actions:**\n"
            f"• Set hard boundaries: no work after 7 PM, no weekend emails\n"
            f"• Take your PTO — it exists for a reason\n"
            f"• Exercise 30 min/day (even walking helps significantly)\n\n"
            f"**Longer term:**\n"
            f"• Talk to your manager about workload (most are receptive)\n"
            f"• If the culture is toxic, start job searching — your health > any job\n"
            f"• Consider therapy/coaching — many companies cover mental health\n\n"
            f"**Perspective:** The best career move is one made from a position of strength, not desperation. Take care of yourself first.")
        return {"response": r, "suggestions": _gen_smart_suggestions(q, covered | {"work_life"}, title, skills, exp_years)}

    # DEFAULT — prompt them to be specific
    uncov = set(_TOPIC_KEYWORDS.keys()) - covered
    topics_display = {"salary":"💰 Salary & negotiation","transition":"🔄 Career transitions","interview_general":"🎯 Interview preparation",
        "skills":"📚 Skills to learn","companies":"🏢 Target companies","resume":"📄 Resume optimization",
        "certs":"🏅 Certifications","networking":"🤝 Networking","remote":"🌍 Remote work","freelance":"💻 Freelancing",
        "leadership":"👔 Leadership path","startup":"🚀 Startup vs MNC","layoff":"🔄 Career recovery",
        "work_life":"⚖️ Work-life balance","international":"✈️ Working abroad","side_project":"🛠️ Side projects"}
    available = [(t, topics_display.get(t, t)) for t in list(uncov)[:6]]
    r = (f"Hi {name}! I'm your AI career counselor. With {exp_years}+ years as a {title} and expertise in {skills_str}, you've built a strong foundation.\n\n"
        f"**I can help you with:**\n"
        + "\n".join(f"• {d}" for _, d in available)
        + f"\n\n**Ask me anything specific** — the more detailed your question, the better my advice! For example: 'How do I negotiate a 30% hike?' or 'Should I learn Kubernetes or Terraform?'")
    return {"response": r, "suggestions": _gen_smart_suggestions(q, covered, title, skills, exp_years)}


# 2. Mock Interview

# 2. Mock Interview — 50+ scenario-based questions
def mock_interview(content: ResumeContent, role: str = None, difficulty: str = "medium", question_count: int = 50, category: str = "all") -> dict:
    """Generate interview questions tailored to the candidate's actual role and domain.
    Uses LLM to generate domain-relevant questions from the resume content."""
    from app.ai import gemini as gemini_client
    target = role or content.contact.title or "Professional"
    skills = content.skills[:10]
    primary = skills[0] if skills else "your field"
    exp = [f"{e.title} at {e.company}" for e in content.experience[:3]]
    exp_years = max(len(content.experience) * 2, 1)
    domain_hint = _domain_context(content)

    # Universal behavioral questions that work for any domain
    behavioral = [
        {"id":1,"type":"behavioral","category":"Leadership","question":"Tell me about a time you led a project or initiative with tight deadlines. How did you prioritize?","tips":"Use STAR format. Show decision-making and delegation."},
        {"id":2,"type":"behavioral","category":"Leadership","question":"Describe a time you mentored or trained someone who was struggling. What was the outcome?","tips":"Show empathy, patience, and measurable improvement."},
        {"id":3,"type":"behavioral","category":"Conflict","question":"Tell me about a disagreement with a colleague or supervisor. How did you handle it?","tips":"Show maturity — listen first, present your perspective, find common ground."},
        {"id":4,"type":"behavioral","category":"Failure","question":"Tell me about your biggest professional failure. What did you learn?","tips":"Own the mistake, focus 70% on what you learned and changed."},
        {"id":5,"type":"behavioral","category":"Achievement","question":"What's your proudest professional achievement? Walk me through it.","tips":"Pick one with measurable impact. Quantify the result."},
        {"id":6,"type":"behavioral","category":"Teamwork","question":"Describe a time you worked with a team where members had different approaches. How did you collaborate?","tips":"Show facilitation skills — acknowledge different views, find the best solution."},
        {"id":7,"type":"behavioral","category":"Pressure","question":"Tell me about working under extreme pressure. How did you manage?","tips":"Show composure, prioritization, and successful delivery."},
        {"id":8,"type":"behavioral","category":"Communication","question":"Describe a time you had to explain a complex concept to someone outside your field.","tips":"Show ability to simplify without losing accuracy."},
        {"id":9,"type":"behavioral","category":"Initiative","question":"Tell me about something you did without being asked that had a positive impact.","tips":"Show proactivity and ownership."},
        {"id":10,"type":"behavioral","category":"Adaptability","question":"Describe a time when priorities changed suddenly. How did you adapt?","tips":"Show flexibility and positive attitude toward change."},
    ]

    # If Gemini is available, generate domain-specific questions
    domain_questions = []
    if gemini_client.available():
        try:
            prompt = (
                f"Generate {min(question_count, 30)} unique, domain-specific interview questions for a {target} role.\n"
                f"{domain_hint}\n"
                f"Skills: {', '.join(skills)}\n"
                f"Experience: {'; '.join(exp)}\n"
                f"Difficulty: {difficulty}\n\n"
                "Create questions that are SPECIFIC to this person's domain — NOT generic tech questions. "
                "Include a mix of: technical/domain-knowledge, situational/scenario-based, role-specific, and culture-fit questions.\n"
                f"Return JSON array: [{{\"id\":11,\"type\":\"technical\",\"category\":\"...\",\"question\":\"...\",\"tips\":\"...\"}}]"
            )
            extra = gemini_client.complete_json(
                prompt,
                system="You are an expert interview question designer across ALL professional domains. Generate questions specific to the candidate's actual field.",
                max_tokens=3000,
                purpose=Purpose.MOCK_INTERVIEW_QUESTIONS,
            )
            if isinstance(extra, list):
                for i, q in enumerate(extra):
                    q["id"] = len(behavioral) + i + 1
                domain_questions = extra
        except Exception:
            pass

    all_questions = behavioral + domain_questions

    # Filter by category if specified
    if category != "all":
        cat_lower = category.lower()
        all_questions = [q for q in all_questions if q["type"] == cat_lower or q.get("category","").lower() == cat_lower]

    # Limit to requested count
    questions = all_questions[:min(question_count, len(all_questions))]

    # Get unique categories for filtering
    categories = sorted(set(q.get("category","") for q in all_questions if q.get("category")))
    types = sorted(set(q.get("type","") for q in all_questions if q.get("type")))

    return {
        "role": target,
        "difficulty": difficulty,
        "total_questions": len(all_questions),
        "questions": questions,
        "categories": categories,
        "types": types,
    }


# 3. Interview Answer Rating & Gap Analysis
def rate_interview_answer(content: ResumeContent, question: str, answer: str, role: str = None) -> dict:
    """Rate a mock interview answer with gap analysis."""
    from app.ai import gemini as gemini_client
    target = role or content.contact.title or "Software Engineer"

    word_count = len(answer.split())
    has_metrics = bool(re.search(r"\d+[%KkMm]|\d+\s*(?:percent|users|engineers|devs|team|customers|months|years|hours|min)", answer))
    has_numbers = any(c.isdigit() for c in answer)
    has_star = any(w in answer.lower() for w in ["situation", "task", "action", "result", "challenge", "outcome", "impact"])
    has_context = any(w in answer.lower() for w in ["at ", "in my role", "when i", "when we", "our team", "i led", "i built", "i designed", "i managed", "we had", "the project", "the team"])
    has_example = any(w in answer.lower() for w in ["for example", "for instance", "such as", "specifically", "in particular", "one time", "recently", "last year"])
    has_action_verbs = len(re.findall(r"\b(led|built|designed|implemented|reduced|improved|achieved|launched|managed|created|developed|delivered|mentored|resolved|architected|optimized|automated|migrated|deployed)\b", answer.lower()))

    score = 35
    if word_count >= 25: score += 5
    if word_count >= 50: score += 8
    if word_count >= 80: score += 7
    if has_metrics: score += 15
    elif has_numbers: score += 8
    if has_star: score += 10
    elif has_context: score += 8
    if has_example: score += 7
    if has_action_verbs >= 2: score += 10
    elif has_action_verbs >= 1: score += 5

    strengths, gaps = [], []
    if word_count >= 50: strengths.append("Good level of detail in the response.")
    else: gaps.append("Answer is too brief — aim for 80-150 words with specific examples.")
    if has_metrics: strengths.append("Excellent use of quantifiable metrics and results.")
    elif has_numbers: strengths.append("Includes some numbers — try adding percentage impact or scale.")
    else: gaps.append("Add specific numbers and metrics (e.g., 'reduced latency by 40%').")
    if has_star: strengths.append("Good use of structured response (STAR/context-action-result).")
    elif has_context: strengths.append("Provides context from real experience.")
    else: gaps.append("Structure your answer: Context → Action → Result.")
    if has_action_verbs >= 2: strengths.append(f"Strong action verbs used ({has_action_verbs} found).")
    elif has_action_verbs == 0: gaps.append("Use action verbs: led, built, designed, improved, reduced.")
    if has_example: strengths.append("Includes concrete examples.")

    base_result = {
        "score": min(score, 100),
        "rating": "Excellent" if score >= 85 else "Good" if score >= 70 else "Needs Improvement" if score >= 50 else "Weak",
        "strengths": strengths or ["Answer addresses the question."],
        "gaps": gaps or ["Consider adding more specifics."],
        "suggested_answer": f"A strong answer includes: 1) Specific situation/context, 2) Your exact actions, 3) Measurable results, 4) Key learning. Reference: 'Cracking the Coding Interview' — Gayle McDowell.",
        "references": ["'Cracking the Coding Interview' — Gayle McDowell", "'The STAR Interview Method' — Indeed Career Guide", f"'{target} Interview Questions' — Glassdoor"],
    }

    # Try Gemini for deeper analysis
    if gemini_client.available():
        try:
            prompt = (
                f"Rate this interview answer (0-100) for a {target} role.\n\n"
                f"Question: {question}\nAnswer: {answer}\n\n"
                f"Return JSON: {{\"score\":0-100,\"rating\":\"\",\"strengths\":[],\"gaps\":[],\"suggested_answer\":\"\",\"references\":[]}}"
            )
            result = gemini_client.complete_json(prompt, system="Expert interview coach. Be specific and actionable.", max_tokens=1000, purpose=Purpose.MOCK_INTERVIEW_ANSWER_RATING)
            if isinstance(result, dict) and "score" in result:
                return result
        except Exception:
            pass

    return base_result


# 4. AI Job Agent
def ai_job_agent(content: ResumeContent, target_role: str = None, location: str = None, preferences: dict = None) -> dict:
    """LinkedIn-only AI job agent.

    Finds real LinkedIn job postings matching the user's resume and prepares an
    "apply on behalf" package for each one: a tailored cover letter and ready
    answers to common recruiter screening questions.

    On automated submission: LinkedIn has no public "apply" API and automating
    its UI violates its Terms of Service, so this agent does not silently submit
    applications to LinkedIn servers. Instead, for each matched role it returns
    a deep apply link plus everything needed to apply in one click. The
    "Apply All" action records the application against the user's verified email
    and opens each LinkedIn apply page — a human stays in the loop, which is both
    ToS-compliant and what recruiters expect.
    """
    from urllib.parse import quote_plus

    name = content.contact.name or "Candidate"
    title = target_role or content.contact.title or "Software Engineer"
    skills = content.skills[:10]
    location = location or content.contact.location or "India"
    q = quote_plus(title)
    loc = quote_plus(location)

    linkedin_search_url = f"https://www.linkedin.com/jobs/search/?keywords={q}&location={loc}&f_TPR=r2592000&sortBy=DD"

    # LinkedIn is the only source for this agent.
    job_sources = [
        {"platform": "LinkedIn", "url": linkedin_search_url, "icon": "🔗"},
    ]

    def _cover_letter_for(company: str) -> str:
        first_bullet = (
            content.experience[0].bullets[0].lower()
            if content.experience and content.experience[0].bullets
            else "delivered measurable results"
        )
        return (
            f"Dear Hiring Manager,\n\n"
            f"I'm excited to apply for the {title} role at {company}. With "
            f"{len(content.experience)} role(s) and hands-on experience in "
            f"{', '.join(skills[:5]) or 'the core skills for this position'}, "
            f"I'm confident I can contribute quickly.\n\n"
            f"In my most recent role I {first_bullet}. I'd welcome the chance to "
            f"bring that impact to {company}.\n\n"
            f"Best regards,\n{name}"
        )

    recruiter_qa = [
        {"question": "Why are you looking for a change?",
         "answer": f"I want to apply my {', '.join(skills[:3]) or 'skills'} at greater scale with more ownership."},
        {"question": "Salary expectations?",
         "answer": f"I'm open to a package in line with market rates for a {title} with my experience; happy to discuss the full picture."},
        {"question": "Notice period?",
         "answer": "Flexible depending on the opportunity — I'll ensure a smooth handover."},
        {"question": "Why should we hire you?",
         "answer": f"I bring {len(content.experience)} role(s) of experience in {', '.join(skills[:4]) or 'its core areas'} with a track record of results."},
    ]

    job_listings = []

    # ── 1. Try real LinkedIn postings ────────────────────────────────────────
    try:
        from app import linkedin_tools
        combined = f"{title} {' '.join(skills[:2])}".strip()
        scrape = linkedin_tools.search_jobs({
            "keywords": combined,
            "location": location,
            "datePosted": "past-month",
            "sortBy": "most-recent",
            "limit": 25,
        })
        for job in scrape.get("jobs", []):
            url = job.get("url")
            if not url:
                continue
            company = job.get("company", "")
            job_listings.append({
                "company": company,
                "role": job.get("title", title),
                "location": job.get("location", location),
                "glassdoor_rating": "N/A",
                "match_reason": (
                    ("Easy Apply · " if job.get("isEasyApply") else "")
                    + f"Posted {job.get('postedTimeAgo', 'recently')}"
                ),
                "posted": job.get("postedTimeAgo", ""),
                "easy_apply": bool(job.get("isEasyApply")),
                # LinkedIn-only: a single real apply link per job.
                "apply_url": url,
                "cover_letter": _cover_letter_for(company or title),
                "status": "ready",
            })
        logger.info("AI job agent: LinkedIn scraper returned %d jobs", len(job_listings))
    except Exception as exc:
        logger.warning("AI job agent LinkedIn scrape failed: %s", exc)

    # ── 2. Fallback: well-known companies, LinkedIn apply links only ─────────
    if not job_listings:
        fallback = [
            "Google", "Microsoft", "Amazon", "Flipkart", "Razorpay", "Swiggy",
            "PhonePe", "CRED", "Atlassian", "Freshworks", "Zoho", "Meesho",
            "Postman", "BrowserStack", "Zerodha",
        ]
        for company in fallback:
            cq = quote_plus(f"{title} {company}")
            job_listings.append({
                "company": company,
                "role": title,
                "location": location,
                "glassdoor_rating": "N/A",
                "match_reason": f"Strong match for {', '.join(skills[:3]) or 'your profile'}",
                "posted": "",
                "easy_apply": False,
                "apply_url": f"https://www.linkedin.com/jobs/search/?keywords={cq}&location={loc}",
                "cover_letter": _cover_letter_for(company),
                "status": "ready",
            })

    # Optional AI-personalised default cover letter (best-effort).
    cover_letter = _cover_letter_for(job_listings[0]["company"] if job_listings else title)
    try:
        from app.ai import gemini as gemini_client
        if gemini_client.available():
            prompt = (
                f"Write a concise professional cover letter (under 150 words) for "
                f"{name} applying for {title}. Skills: {', '.join(skills)}. "
                f"Return only the letter."
            )
            ai_letter = gemini_client.complete(prompt, system="Professional cover letter writer.", max_tokens=500, purpose=Purpose.JOB_AGENT)
            if len(ai_letter) > 50:
                cover_letter = ai_letter
    except Exception:
        pass

    return {
        "status": "ready",
        "source": "LinkedIn",
        "apply_mode": "assisted",  # human-in-the-loop; see function docstring
        "apply_note": (
            "Applications are prepared on your behalf and submitted through "
            "LinkedIn's apply pages (one click each). LinkedIn has no public "
            "auto-apply API, so a verified click finalises each application."
        ),
        "target_role": title,
        "location": location,
        "linkedin_search_url": linkedin_search_url,
        "job_sources": job_sources,
        "job_listings": job_listings,
        "cover_letter": cover_letter,
        "recruiter_qa": recruiter_qa,
        "tips": [
            "Personalise the cover letter per company before applying",
            "Apply within 48 hours of posting for ~3x more callbacks",
            "Connect with the hiring manager on LinkedIn after applying",
            "Follow up within a week",
        ],
    }



# 5. OTP Verification
def generate_otp() -> str:
    """Generate a 6-digit OTP."""
    import random
    return str(random.randint(100000, 999999))



# ─────────────────────────────────────────────────────────────
# Trending Jobs
def trending_jobs(content: ResumeContent) -> dict:
    """Return trending job roles matching the resume skills and experience.
    Always uses LLM for domain-relevant results."""
    skills_text  = " ".join(s.lower() for s in content.skills)
    title_text   = (content.contact.title or "").lower()
    domain_hint = _domain_context(content)

    if not client.available():
        return {
            "jobs": [],
            "market_insight": f"AI key not configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY to get personalized trending job recommendations for your field.",
        }

    system = (
        "You are a hiring market analyst with deep knowledge of job markets across ALL industries and domains. "
        "Detect the candidate's professional domain from their resume and recommend trending roles in THEIR field. "
        "Never default to tech/software roles unless the resume is actually in tech."
    )
    prompt = (
        f"Based on this professional's background, list the top 4 trending job roles most relevant to them.\n"
        f"{domain_hint}\n"
        f"Skills: {skills_text[:300]}\n"
        f"Current title: {title_text}\n\n"
        "For each role include: title, category, demand_level, avg_salary (INR), "
        "description (2-3 sentences on WHY it's trending in their domain), "
        "tech_stack or key_tools (list of 6-8 items relevant to their field), match_score (0-100), "
        "certifications (list of 3, each with name+provider+url), "
        "hiring_companies (list of 6 company objects with name).\n"
        "Also include a market_insight string (2-3 sentences on the job market in their specific domain for 2025-26).\n"
        'Return ONLY JSON: {"jobs": [...], "market_insight": "..."}'
    )
    try:
        data = client.complete_json(prompt, system=system, max_tokens=2500, purpose=Purpose.TRENDING_JOBS)
        # Normalize jobs to ensure consistent schema regardless of LLM output quirks
        normalized_jobs = []
        for job in data.get("jobs", []):
            # Normalize certifications: ensure `url` field exists
            certs = job.get("certifications", [])
            normalized_certs = []
            for cert in certs:
                if isinstance(cert, dict):
                    normalized_certs.append({
                        "name": cert.get("name", ""),
                        "provider": cert.get("provider", ""),
                        "url": cert.get("url") or cert.get("udemy_url") or cert.get("coursera_url") or "",
                    })
                elif isinstance(cert, str):
                    normalized_certs.append({"name": cert, "provider": "", "url": ""})
            # Normalize hiring_companies: ensure objects with `name` field
            companies = job.get("hiring_companies", [])
            normalized_companies = []
            for co in companies:
                if isinstance(co, dict):
                    normalized_companies.append({"name": co.get("name", co.get("company", ""))})
                elif isinstance(co, str):
                    normalized_companies.append({"name": co})
            normalized_jobs.append({
                "title": job.get("title", ""),
                "category": job.get("category", ""),
                "demand_level": job.get("demand_level", "High Demand"),
                "avg_salary": job.get("avg_salary", ""),
                "description": job.get("description", ""),
                "tech_stack": job.get("tech_stack") or job.get("key_tools") or [],
                "match_score": job.get("match_score", 0),
                "certifications": normalized_certs,
                "hiring_companies": normalized_companies,
            })
        return {
            "jobs": normalized_jobs,
            "market_insight": data.get("market_insight", ""),
        }
    except Exception as e:
        logger.warning("AI trending jobs failed: %s", e)
        return {
            "jobs": [],
            "market_insight": "AI service temporarily unavailable. Please try again in a moment.",
        }


# ---------------- Interview learning materials (replaces Text Interview) ------

def _generate_skill_based_qa(title: str, skills: list, target: int = 100) -> tuple:
    """Generate detailed, skill-tailored interview Q&A via the AI provider.

    Questions are generated for the exact skills on the user's resume; each
    question's ``category`` is the skill it targets, so the result is provably
    tailored to the resume. Skills are processed in small batches to stay within
    model output limits, and a short behavioral batch is added because real
    interviews always include those. Returns ``(qa_list, skills_covered)``.
    """
    qa: list = []
    seen_q: set = set()
    skills_covered: list = []

    def _absorb(items, default_cat):
        for it in items or []:
            q = (it.get("question") or "").strip()
            a = (it.get("answer") or "").strip()
            if not q or not a:
                continue
            key = q.lower()
            if key in seen_q:
                continue
            seen_q.add(key)
            qa.append({
                "category": (it.get("category") or default_cat).strip() or default_cat,
                "question": q,
                "answer": a,
            })

    # 1) A short behavioral/HR batch (always relevant, role-aware).
    try:
        beh = client.complete_json(
            (
                f"Generate 8 common behavioral/HR interview questions WITH detailed "
                f"model answers for a {title}. Each answer must be 3-5 sentences of "
                f"concrete, actionable guidance (use STAR where relevant).\n"
                'Return ONLY JSON: {"qa":[{"category":"Behavioral","question":"","answer":""}]}'
            ),
            system="Expert interview coach. Output strict JSON only.",
            max_tokens=2500,
            purpose=Purpose.INTERVIEW_LEARNING_MATERIALS,
        )
        _absorb(beh.get("qa", []), "Behavioral")
    except Exception as exc:
        logger.info("Behavioral Q&A generation skipped: %s", exc)

    # 2) Skill-driven batches — ~5 detailed Q&A per skill, tagged by skill.
    batch_size = 3
    per_skill = 5
    for i in range(0, len(skills), batch_size):
        if len(qa) >= target:
            break
        batch = skills[i:i + batch_size]
        skill_lines = ", ".join(batch)
        try:
            data = client.complete_json(
                (
                    f"You are interviewing a candidate for a {title} role. For EACH of "
                    f"these resume skills: {skill_lines} — write {per_skill} realistic "
                    f"interview questions WITH detailed model answers. Set each item's "
                    f'"category" to the EXACT skill name it tests. Answers must be 3-5 '
                    f"sentences with concrete technical reasoning and examples, not one-liners.\n"
                    'Return ONLY JSON: {"qa":[{"category":"<skill>","question":"","answer":""}]}'
                ),
                system="Senior technical interviewer. Output strict JSON only.",
                max_tokens=4000,
                purpose=Purpose.INTERVIEW_LEARNING_MATERIALS,
            )
            before = len(qa)
            _absorb(data.get("qa", []), batch[0])
            if len(qa) > before:
                skills_covered.extend(batch)
        except Exception as exc:
            logger.info("Skill Q&A batch failed for %s: %s", skill_lines, exc)
            continue

    # De-dupe skills_covered, preserve order.
    seen_s = set()
    skills_covered = [s for s in skills_covered if not (s.lower() in seen_s or seen_s.add(s.lower()))]
    return qa[:target], skills_covered


def interview_learning_materials(content: ResumeContent, role: str = None) -> dict:
    """Downloadable interview-prep materials + skill-tailored solved Q&A.

    The solved Q&A is generated by the AI provider from the skills on the user's
    resume (each question is tagged with the skill it tests), so it's tailored to
    the candidate rather than generic. If no AI provider is configured or
    generation fails, a curated fallback bank is used so the feature still works.
    Study-resource links point to stable, reputable public learning sites and are
    not scraped at request time.
    """
    title = role or (content.contact.title if content else None) or "Software Engineer"
    # Clean, de-duplicated skills straight from the resume — these drive the Q&A.
    skills = []
    _seen = set()
    for s in (content.skills if content else []) or []:
        s = (s or "").strip()
        key = s.lower()
        if s and key not in _seen:
            _seen.add(key)
            skills.append(s)
    skills = skills[:15]

    resources = [
        {"topic": "Data Structures & Algorithms",
         "items": [
             {"name": "NeetCode 150 (curated patterns)", "url": "https://neetcode.io/practice"},
             {"name": "LeetCode — Top Interview 150", "url": "https://leetcode.com/studyplan/top-interview-150/"},
             {"name": "GeeksforGeeks — DSA self-paced", "url": "https://www.geeksforgeeks.org/data-structures/"},
         ]},
        {"topic": "System Design",
         "items": [
             {"name": "System Design Primer (GitHub)", "url": "https://github.com/donnemartin/system-design-primer"},
             {"name": "ByteByteGo — System Design 101", "url": "https://github.com/ByteByteGoHq/system-design-101"},
         ]},
        {"topic": "Behavioral / HR",
         "items": [
             {"name": "STAR method guide (The Muse)", "url": "https://www.themuse.com/advice/star-interview-method"},
             {"name": "Amazon Leadership Principles", "url": "https://www.amazon.jobs/content/en/our-workplace/leadership-principles"},
         ]},
        {"topic": "Core CS fundamentals",
         "items": [
             {"name": "OS / DBMS / Networks — GfG", "url": "https://www.geeksforgeeks.org/computer-science-projects/"},
             {"name": "SQL practice (LeetCode DB)", "url": "https://leetcode.com/studyplan/top-sql-50/"},
         ]},
    ]

    # Skill-specific study links (based on the resume's skills).
    if skills:
        from urllib.parse import quote_plus
        resources.insert(0, {
            "topic": "Your skills — targeted practice",
            "items": [
                {"name": f"{s} interview questions",
                 "url": f"https://www.google.com/search?q={quote_plus(s + ' interview questions and answers')}"}
                for s in skills[:8]
            ],
        })

    # Curated fallback Q&A bank — used ONLY when no AI provider is configured or
    # AI generation fails. The primary path below builds the Q&A from the user's
    # actual resume skills via AI (see _generate_skill_based_qa).
    fallback_qa = [
        {
                "category": "Behavioral",
                "question": "Tell me about yourself.",
                "answer": "Use a present–past–future structure. Present: your current role, scope, and the kind of problems you own. Past: one or two achievements that built the strengths relevant to this job, ideally quantified. Future: why this specific role is the logical next step. Keep it to 60–90 seconds and tailor every part to the job description rather than reciting your resume chronologically."
        },
        {
                "category": "Behavioral",
                "question": "Describe a time you handled conflict on a team.",
                "answer": "Answer with STAR. Situation: a concrete disagreement, e.g. two engineers favouring different designs. Task: your responsibility in resolving it. Action: how you listened to both sides, surfaced the shared goal, and proposed a data-backed compromise or a small spike to test assumptions. Result: the outcome plus what you changed about how you work. Avoid blaming others and show you can disagree without damaging the relationship."
        },
        {
                "category": "Behavioral",
                "question": "Tell me about a project you're proud of.",
                "answer": "Pick something with measurable impact and clear personal ownership. State the problem and why it mattered, your specific contribution (say 'I', not 'we'), the key technical decisions and trade-offs you made, and the quantified result such as latency reduced, revenue added, or hours saved. Close with what you learned, which signals growth rather than a one-off success."
        },
        {
                "category": "Behavioral",
                "question": "Describe a time you failed.",
                "answer": "Choose a real failure with a recovery, not a humble-brag. Explain the situation and the decision that went wrong, take genuine ownership without over-apologising, then focus most of the answer on what you did to contain the damage and the concrete process change you made so it can't recur. Interviewers are testing self-awareness and resilience, not whether you've ever failed."
        },
        {
                "category": "Behavioral",
                "question": "How do you prioritise when everything is urgent?",
                "answer": "Describe a framework: clarify the actual deadline and impact of each item, separate urgent from important, and align with stakeholders on what can slip. Mention a concrete tool such as an impact/effort matrix or simply negotiating scope. Give an example where you pushed back on a low-value 'urgent' task to protect a high-impact one, and how you communicated that trade-off transparently."
        },
        {
                "category": "Behavioral",
                "question": "Tell me about a time you received critical feedback.",
                "answer": "Pick feedback you initially disagreed with but acted on. Describe the feedback plainly, your first reaction, and how you separated the signal from your ego. Explain the specific change you made and the improved outcome. This shows coachability — one of the strongest predictors of growth that interviewers screen for."
        },
        {
                "category": "Behavioral",
                "question": "Describe a time you influenced a decision without authority.",
                "answer": "Show how you led through persuasion rather than title. Explain the decision, who the stakeholders were, and how you built the case — data, a prototype, or aligning the proposal with each person's goals. Highlight the result and that you brought people along rather than forcing it, which demonstrates senior behaviour regardless of your level."
        },
        {
                "category": "Behavioral",
                "question": "How do you handle tight deadlines?",
                "answer": "Explain that you protect quality by managing scope, not by cutting corners silently. Describe breaking the work down, identifying the riskiest pieces first, communicating progress early, and negotiating what 'done' means with stakeholders. Give an example where you shipped a focused MVP on time and scheduled the rest as a fast follow."
        },
        {
                "category": "Behavioral",
                "question": "Tell me about a time you mentored someone.",
                "answer": "Describe identifying what the person needed, adapting your approach to their level, and giving them ownership rather than answers. Mention a concrete outcome such as them shipping independently or growing into a new responsibility. Mentoring answers signal leadership potential and that you scale beyond your own output."
        },
        {
                "category": "Behavioral",
                "question": "Describe a situation where requirements changed mid-project.",
                "answer": "Show adaptability and calm. Explain the change, how you assessed its impact on timeline and design, and how you re-planned with stakeholders instead of resisting. Emphasise that you treated changing requirements as normal and protected the team from churn by re-prioritising clearly."
        },
        {
                "category": "Behavioral",
                "question": "How do you deal with a teammate who isn't pulling their weight?",
                "answer": "Start with curiosity, not accusation — there may be a blocker, unclear expectations, or something personal. Describe a private, direct conversation focused on specifics and shared goals, offering help, and escalating to a manager only if the pattern continues. This shows maturity and that you address issues directly but kindly."
        },
        {
                "category": "Behavioral",
                "question": "Why are you looking to leave your current role?",
                "answer": "Stay positive and forward-looking. Frame it around what you want next — more scope, a problem space you care about, or growth your current role can't offer — rather than complaints about your employer. Negativity about a past job is a red flag, so even a bad situation should be framed as a constructive reason to move on."
        },
        {
                "category": "HR",
                "question": "Why do you want to work here?",
                "answer": "Reference something specific: the product, a recent launch, the engineering culture, or the problem space, and connect it to your skills and goals. Generic praise like 'great company' signals you didn't research. The interviewer wants evidence you'll be motivated by this particular role, not just any job."
        },
        {
                "category": "HR",
                "question": "What are your salary expectations?",
                "answer": "Give a researched range based on the role, your level, and the local market, and add that you're open to discussing the full package. If asked early, you can deflect once ('I'd like to understand the scope first'), but have a number ready. Anchoring with a realistic, defensible range protects you in negotiation."
        },
        {
                "category": "HR",
                "question": "What's your biggest weakness?",
                "answer": "Name a real, non-fatal weakness and, more importantly, the system you've built to manage it — e.g. you used to under-communicate progress, so now you send proactive updates. Avoid clichés ('I'm a perfectionist') and avoid anything core to the job. The answer is really testing self-awareness and whether you actively work on yourself."
        },
        {
                "category": "HR",
                "question": "Where do you see yourself in five years?",
                "answer": "Show ambition that's compatible with the role. Talk about the kind of problems you want to be solving and the depth or scope you want to grow into, rather than a rigid title. Tie it back to why this company is a good place for that trajectory."
        },
        {
                "category": "HR",
                "question": "Why should we hire you?",
                "answer": "Summarise the two or three things that make you a strong fit: relevant experience, a specific strength the role needs, and evidence you deliver results. Make it about how you solve their problem, not a list of adjectives. Keep it confident and concise."
        },
        {
                "category": "HR",
                "question": "Do you have any questions for us?",
                "answer": "Always have a few. Good ones probe how the team works, what success looks like in the first six months, the biggest current challenge, and how decisions get made. Thoughtful questions signal genuine interest and help you evaluate them — the interview goes both ways."
        },
        {
                "category": "HR",
                "question": "How do you handle stress and pressure?",
                "answer": "Describe concrete habits: breaking big problems into steps, communicating early when at risk, and protecting focus time. Give a short example of staying calm and effective under a real deadline. Avoid claiming you never feel stress; show you have a healthy system for it."
        },
        {
                "category": "HR",
                "question": "Tell me about a time you went above and beyond.",
                "answer": "Pick a moment where you took initiative beyond your assigned task and it created value — fixing a recurring pain point, unblocking another team, or improving a process. Quantify the impact. This signals ownership, which is highly valued at every level."
        },
        {
                "category": "DSA",
                "question": "How would you detect a cycle in a linked list?",
                "answer": "Use Floyd's tortoise-and-hare: advance one pointer by one node and another by two. If they ever meet, there's a cycle; if the fast pointer reaches null, there isn't. It runs in O(n) time and O(1) space. To find the cycle's start, reset one pointer to the head and move both one step at a time until they meet again."
        },
        {
                "category": "DSA",
                "question": "Explain the difference between BFS and DFS.",
                "answer": "BFS explores a graph level by level using a queue and finds the shortest path in unweighted graphs; its memory can grow large because it holds an entire frontier. DFS goes as deep as possible using a stack or recursion, uses less memory on wide graphs, and suits problems like topological sort, cycle detection, and connected components. Both are O(V+E)."
        },
        {
                "category": "DSA",
                "question": "What is the time complexity of common operations on a hash table?",
                "answer": "Average-case insert, delete, and lookup are O(1) because hashing maps keys to buckets directly. Worst case degrades to O(n) when many keys collide into one bucket, though good hash functions and resizing keep this rare. Ordering is not preserved, and resizing is an occasional O(n) operation amortised across many inserts."
        },
        {
                "category": "DSA",
                "question": "How does quicksort work and what's its complexity?",
                "answer": "Quicksort picks a pivot, partitions elements into those smaller and larger than it, and recursively sorts each side. Average time is O(n log n) with O(log n) stack space, but a bad pivot on already-sorted data gives O(n²); randomised or median-of-three pivots avoid this. It sorts in place, which is why it's often faster in practice than merge sort despite the same average bound."
        },
        {
                "category": "DSA",
                "question": "When would you use merge sort over quicksort?",
                "answer": "Choose merge sort when you need guaranteed O(n log n) worst-case performance, stable sorting, or you're sorting linked lists or data that doesn't fit in memory (external sort). Its downside is O(n) extra space. Quicksort is usually faster for in-memory arrays but lacks the worst-case guarantee and stability."
        },
        {
                "category": "DSA",
                "question": "Explain dynamic programming with an example.",
                "answer": "Dynamic programming solves problems by combining solutions to overlapping subproblems and storing each result to avoid recomputation. For Fibonacci, naive recursion is exponential because it recomputes the same values; memoising or building a table bottom-up makes it O(n). The two requirements are optimal substructure and overlapping subproblems."
        },
        {
                "category": "DSA",
                "question": "What's the difference between memoization and tabulation?",
                "answer": "Both cache subproblem results. Memoization is top-down: you recurse and store results lazily as they're computed, which is intuitive and only computes needed states. Tabulation is bottom-up: you fill a table iteratively, which avoids recursion overhead and stack limits but may compute states you don't need. Both turn exponential recursion into polynomial time."
        },
        {
                "category": "DSA",
                "question": "How do you find the kth largest element efficiently?",
                "answer": "Use a min-heap of size k: push elements and pop when the heap exceeds k, leaving the kth largest at the top in O(n log k). Alternatively, Quickselect partitions like quicksort but recurses into only one side, giving O(n) average time. Quickselect is faster on average; the heap is simpler and works well for streaming data."
        },
        {
                "category": "DSA",
                "question": "Explain the two-pointer technique.",
                "answer": "Two pointers move through a data structure to avoid nested loops, typically on sorted arrays or linked lists. For example, to find a pair summing to a target in a sorted array, start one pointer at each end and move them inward based on the current sum, achieving O(n) instead of O(n²). It also powers sliding-window and fast/slow-pointer problems."
        },
        {
                "category": "DSA",
                "question": "What is a sliding window and when is it useful?",
                "answer": "A sliding window maintains a contiguous range over an array or string and adjusts its boundaries as it scans, reusing work from the previous position. It's ideal for problems like the longest substring without repeats or the maximum sum subarray of size k, turning O(n·k) brute force into O(n). The key is updating the window incrementally rather than recomputing."
        },
        {
                "category": "DSA",
                "question": "How would you reverse a linked list?",
                "answer": "Iterate through the list maintaining three pointers — previous, current, and next. For each node, save next, point current's link back to previous, then advance previous and current. It runs in O(n) time and O(1) space. A recursive version exists but uses O(n) stack space, so the iterative approach is preferred for long lists."
        },
        {
                "category": "DSA",
                "question": "Explain Big-O, Big-Theta, and Big-Omega.",
                "answer": "Big-O is an upper bound on growth (worst case), Big-Omega is a lower bound (best case), and Big-Theta is a tight bound when upper and lower match. In interviews 'complexity' usually means Big-O worst case. Remember it describes growth rate as input grows, ignoring constants, so O(2n) and O(n) are the same class."
        },
        {
                "category": "DSA",
                "question": "What data structure backs an LRU cache and why?",
                "answer": "An LRU cache combines a hash map with a doubly linked list. The hash map gives O(1) lookup by key, and the doubly linked list maintains usage order so the least-recently-used item is at one end for O(1) eviction. On access you move the node to the front; on insert past capacity you remove the tail. Both operations stay O(1)."
        },
        {
                "category": "DSA",
                "question": "How do you detect if two strings are anagrams?",
                "answer": "Either sort both strings and compare in O(n log n), or count character frequencies in a hash map or fixed-size array and compare counts in O(n). The counting approach is faster and handles Unicode if you use a map. Edge cases include case sensitivity and whitespace, which you should clarify first."
        },
        {
                "category": "DSA",
                "question": "Explain binary search and its constraints.",
                "answer": "Binary search repeatedly halves a sorted range, comparing the target to the middle element and discarding half each step, giving O(log n). It requires random access and sorted data. Common bugs are off-by-one boundaries and integer overflow when computing the midpoint, which you avoid with low + (high - low) / 2."
        },
        {
                "category": "DSA",
                "question": "What is a heap and what are its uses?",
                "answer": "A heap is a complete binary tree where each parent satisfies an order property — min-heap (parent ≤ children) or max-heap. It gives O(log n) insert and extract-min/max and O(1) peek, backing priority queues, Dijkstra's algorithm, heap sort, and top-k problems. It's typically stored in an array using index arithmetic rather than explicit nodes."
        },
        {
                "category": "DSA",
                "question": "How would you find the middle of a linked list in one pass?",
                "answer": "Use fast and slow pointers: advance the fast pointer two nodes for every one node of the slow pointer. When the fast pointer reaches the end, the slow pointer is at the middle. This is a single O(n) pass with O(1) space, avoiding the need to count length first."
        },
        {
                "category": "DSA",
                "question": "Explain recursion and the role of the base case.",
                "answer": "Recursion solves a problem by calling itself on smaller inputs until it reaches a base case that returns directly without recursing. The base case prevents infinite recursion and stack overflow. Each call adds a stack frame, so deep recursion can exhaust memory — which is why iterative or tail-recursive forms are sometimes preferred."
        },
        {
                "category": "OOP",
                "question": "Explain the four pillars of OOP.",
                "answer": "Encapsulation bundles data with the methods that operate on it and hides internal state behind an interface. Abstraction exposes only essential behaviour and hides complexity. Inheritance lets a class reuse and extend another's behaviour. Polymorphism lets one interface work with different underlying types, e.g. calling the same method on different subclasses. Together they promote modular, reusable, maintainable code."
        },
        {
                "category": "OOP",
                "question": "What is the difference between composition and inheritance?",
                "answer": "Inheritance models an 'is-a' relationship and reuses a parent's implementation, but tight coupling makes deep hierarchies brittle. Composition models 'has-a' by holding other objects and delegating to them, which is more flexible and testable. The common guidance 'favour composition over inheritance' exists because composition avoids the fragile base-class problem."
        },
        {
                "category": "OOP",
                "question": "Explain the SOLID principles briefly.",
                "answer": "Single Responsibility: a class should have one reason to change. Open/Closed: open for extension, closed for modification. Liskov Substitution: subtypes must be usable wherever their base type is expected. Interface Segregation: prefer small, specific interfaces over fat ones. Dependency Inversion: depend on abstractions, not concretions. They reduce coupling and make code easier to extend and test."
        },
        {
                "category": "OOP",
                "question": "What is polymorphism with a concrete example?",
                "answer": "Polymorphism lets the same call behave differently based on the object's actual type. For example, a Shape base class with an area() method overridden by Circle and Square — calling shape.area() runs the correct implementation at runtime (dynamic dispatch). This lets you write code against the abstraction and add new shapes without changing callers."
        },
        {
                "category": "OOP",
                "question": "Difference between abstract class and interface.",
                "answer": "An abstract class can hold state and provide partial implementation and is meant to be a shared base; a class can extend only one. An interface (in most languages) declares behaviour with no state, and a class can implement many. Use an abstract class for shared code among closely related types, and interfaces to express capabilities across unrelated types."
        },
        {
                "category": "OOP",
                "question": "What is dependency injection and why use it?",
                "answer": "Dependency injection supplies an object's collaborators from outside rather than having it construct them itself. This decouples classes from concrete implementations, making them easier to test (you inject mocks), reconfigure, and reuse. It's the practical application of the Dependency Inversion principle and underpins most modern frameworks."
        },
        {
                "category": "OOP",
                "question": "Explain the Singleton pattern and its drawbacks.",
                "answer": "Singleton ensures a class has one instance with a global access point, useful for shared resources like a config or connection pool. Drawbacks: it introduces global state, hides dependencies, complicates unit testing, and can cause issues in multithreaded code if not implemented carefully. Many teams prefer injecting a single instance via a DI container instead."
        },
        {
                "category": "OOP",
                "question": "What's the difference between method overloading and overriding?",
                "answer": "Overloading defines multiple methods with the same name but different parameter lists in the same class, resolved at compile time. Overriding redefines a parent method in a subclass with the same signature, resolved at runtime via dynamic dispatch. Overloading is about convenience; overriding is the mechanism behind polymorphism."
        },
        {
                "category": "DBMS",
                "question": "Explain database normalization and its forms.",
                "answer": "Normalization organises tables to reduce redundancy and anomalies. 1NF requires atomic values and no repeating groups; 2NF removes partial dependencies on part of a composite key; 3NF removes transitive dependencies on non-key columns. Higher normal forms exist, but most schemas target 3NF. The trade-off is more joins, which is why analytics systems often denormalize for read speed."
        },
        {
                "category": "DBMS",
                "question": "What is the difference between a primary key and a unique key?",
                "answer": "A primary key uniquely identifies each row, cannot be null, and there is exactly one per table. A unique key also enforces uniqueness but allows one null (database-dependent) and you can have several per table. The primary key is typically the row's main identity and is often clustered, affecting physical storage order."
        },
        {
                "category": "DBMS",
                "question": "Explain ACID properties.",
                "answer": "Atomicity means a transaction fully completes or fully rolls back. Consistency means it moves the database from one valid state to another, respecting constraints. Isolation means concurrent transactions don't see each other's intermediate state. Durability means committed changes survive crashes. Together they guarantee reliable transactional behaviour, central to relational databases."
        },
        {
                "category": "DBMS",
                "question": "What are database indexes and what's the trade-off?",
                "answer": "An index is an auxiliary structure, usually a B-tree, that lets the database find rows by a column without scanning the whole table, turning O(n) lookups into roughly O(log n). The trade-off is slower writes (the index must be updated) and extra storage. You index columns used in WHERE, JOIN, and ORDER BY, but over-indexing hurts write-heavy workloads."
        },
        {
                "category": "DBMS",
                "question": "Difference between INNER JOIN and LEFT JOIN.",
                "answer": "INNER JOIN returns only rows with matches in both tables. LEFT JOIN returns all rows from the left table and matching rows from the right, filling nulls where there's no match. Use LEFT JOIN when you want to keep records that may not have related rows, such as users with no orders."
        },
        {
                "category": "DBMS",
                "question": "What is the N+1 query problem?",
                "answer": "It occurs when code runs one query to fetch a list, then one additional query per item to fetch related data — N+1 queries total. It silently kills performance as the list grows. Fix it by eager-loading the related data in a single join or batched query, which most ORMs support via 'include' or 'prefetch'."
        },
        {
                "category": "DBMS",
                "question": "Explain the difference between SQL and NoSQL.",
                "answer": "SQL databases are relational, use fixed schemas and strong consistency, and excel at complex queries and transactions. NoSQL covers document, key-value, column, and graph stores, offering flexible schemas and horizontal scaling, often trading some consistency for availability. Choose SQL for structured, relational, transactional data; NoSQL for large-scale, flexible, or specialised access patterns."
        },
        {
                "category": "DBMS",
                "question": "What is a transaction isolation level?",
                "answer": "Isolation levels control how much concurrent transactions can interfere. Read Uncommitted allows dirty reads; Read Committed prevents them; Repeatable Read prevents non-repeatable reads; Serializable prevents phantom reads and behaves as if transactions ran one at a time. Higher isolation reduces anomalies but lowers concurrency, so you pick the weakest level that's correct for your case."
        },
        {
                "category": "DBMS",
                "question": "What is a deadlock and how do you handle it?",
                "answer": "A deadlock happens when two transactions each hold a lock the other needs, so neither can proceed. Databases detect this and abort one transaction so the other continues. To reduce deadlocks, acquire locks in a consistent order, keep transactions short, and use appropriate isolation levels. Applications should retry the aborted transaction."
        },
        {
                "category": "DBMS",
                "question": "Explain denormalization and when to use it.",
                "answer": "Denormalization deliberately adds redundancy — duplicated columns or precomputed aggregates — to avoid expensive joins and speed up reads. It's common in reporting and analytics systems and read-heavy services. The cost is more complex writes and the risk of inconsistent data, so you use it selectively where read performance matters more than write simplicity."
        },
        {
                "category": "DBMS",
                "question": "What's the difference between WHERE and HAVING?",
                "answer": "WHERE filters rows before grouping and cannot reference aggregate functions. HAVING filters after GROUP BY and can use aggregates like COUNT or SUM. For example, WHERE narrows which orders to consider, while HAVING keeps only customers whose total order count exceeds a threshold."
        },
        {
                "category": "DBMS",
                "question": "What is database sharding?",
                "answer": "Sharding splits a large dataset horizontally across multiple database servers, each holding a subset of rows chosen by a shard key. It enables scaling writes and storage beyond one machine. The challenges are choosing a shard key that distributes load evenly, handling cross-shard queries, and rebalancing as data grows."
        },
        {
                "category": "OS",
                "question": "Explain the difference between a process and a thread.",
                "answer": "A process is an independent program with its own memory space; a thread is a unit of execution within a process that shares that process's memory. Threads are cheaper to create and switch and communicate easily through shared memory, but that sharing requires synchronisation to avoid race conditions. Processes are isolated and fault-contained but heavier and communicate via IPC."
        },
        {
                "category": "OS",
                "question": "What is a deadlock and what conditions cause it?",
                "answer": "A deadlock is when processes wait on each other's resources forever. It requires four simultaneous conditions: mutual exclusion, hold-and-wait, no preemption, and circular wait. Breaking any one prevents deadlock — for example, imposing a global lock ordering eliminates circular wait. Systems also handle it via detection-and-recovery or avoidance like the banker's algorithm."
        },
        {
                "category": "OS",
                "question": "Explain virtual memory and paging.",
                "answer": "Virtual memory gives each process its own large, contiguous address space that the OS maps to physical RAM and disk. Memory is divided into fixed-size pages; the page table translates virtual to physical addresses, and pages not in RAM are fetched from disk on a page fault. This isolates processes, enables more memory than physically exists, and simplifies allocation."
        },
        {
                "category": "OS",
                "question": "What is a race condition and how do you prevent it?",
                "answer": "A race condition occurs when the correctness of a program depends on the unpredictable timing of concurrent operations on shared data. You prevent it with synchronisation primitives — mutexes, locks, semaphores, or atomic operations — that ensure only one thread touches the critical section at a time, or by avoiding shared mutable state altogether."
        },
        {
                "category": "OS",
                "question": "Difference between mutex and semaphore.",
                "answer": "A mutex is a locking mechanism owned by one thread at a time for mutual exclusion over a critical section; only the owner can release it. A semaphore is a signalling mechanism with a counter that permits up to N concurrent accesses and can be signalled by any thread. Use a mutex for exclusive access, a semaphore to limit concurrency or coordinate producers and consumers."
        },
        {
                "category": "OS",
                "question": "What happens during a context switch?",
                "answer": "The OS saves the current process or thread's CPU state — registers, program counter, stack pointer — into its control block, then loads the next one's saved state so it resumes where it left off. Context switches enable multitasking but have overhead from saving state and cache invalidation, so excessive switching hurts performance."
        },
        {
                "category": "OS",
                "question": "Explain the difference between preemptive and cooperative scheduling.",
                "answer": "In preemptive scheduling the OS can interrupt a running task to give the CPU to another, ensuring fairness and responsiveness. In cooperative scheduling a task runs until it voluntarily yields, which is simpler but lets a misbehaving task starve others. Most modern OSes use preemptive scheduling with priorities and time slices."
        },
        {
                "category": "OS",
                "question": "What is the difference between concurrency and parallelism?",
                "answer": "Concurrency is structuring a program to handle many tasks that make progress over overlapping time periods, which can happen on a single core via interleaving. Parallelism is actually executing multiple tasks at the same instant on multiple cores. Concurrency is about dealing with many things at once; parallelism is about doing many things at once."
        },
        {
                "category": "Networking",
                "question": "What happens when you type a URL and press Enter?",
                "answer": "The browser resolves the domain to an IP via DNS, opens a TCP connection (and a TLS handshake for HTTPS), and sends an HTTP request. The server processes it and returns a response; the browser parses the HTML, fetches CSS, JS, and images, builds the DOM and CSSOM, renders the page, and executes scripts. Caching, CDNs, and connection reuse optimise each step."
        },
        {
                "category": "Networking",
                "question": "Explain the difference between TCP and UDP.",
                "answer": "TCP is connection-oriented and reliable: it establishes a handshake, guarantees ordered delivery, retransmits lost packets, and controls flow and congestion — ideal for web pages, email, and file transfer. UDP is connectionless and best-effort with no ordering or retransmission, so it's lower latency and used for streaming, gaming, and DNS where speed matters more than perfect delivery."
        },
        {
                "category": "Networking",
                "question": "What is the difference between HTTP and HTTPS?",
                "answer": "HTTPS is HTTP over TLS, which encrypts traffic so it can't be read or tampered with in transit and authenticates the server via certificates. HTTP sends data in plaintext. HTTPS protects credentials and integrity, is required for many modern browser features, and is now the default expectation for any production site."
        },
        {
                "category": "Networking",
                "question": "Explain what a DNS does.",
                "answer": "DNS is the internet's directory that translates human-readable domain names into IP addresses. A resolver queries a hierarchy — root, top-level-domain, and authoritative servers — and caches results with a TTL to speed up future lookups. Without DNS you'd have to remember numeric IPs for every site."
        },
        {
                "category": "Networking",
                "question": "What are the main HTTP methods and their semantics?",
                "answer": "GET retrieves data and should be safe and idempotent. POST creates a resource or triggers processing and is not idempotent. PUT replaces a resource and is idempotent. PATCH partially updates. DELETE removes a resource and is idempotent. Following these semantics makes APIs predictable and cache- and retry-friendly."
        },
        {
                "category": "Networking",
                "question": "Explain common HTTP status code categories.",
                "answer": "2xx means success (200 OK, 201 Created). 3xx means redirection (301 permanent, 302 temporary). 4xx means client errors (400 bad request, 401 unauthenticated, 403 forbidden, 404 not found, 429 too many requests). 5xx means server errors (500 internal, 502 bad gateway, 503 unavailable). Using the right code makes APIs easier to consume and debug."
        },
        {
                "category": "Networking",
                "question": "What is the TCP three-way handshake?",
                "answer": "To establish a connection, the client sends SYN, the server replies SYN-ACK, and the client responds ACK. This synchronises sequence numbers and confirms both sides can send and receive before data flows. Connection teardown uses a similar four-step FIN/ACK exchange."
        },
        {
                "category": "Networking",
                "question": "What is a load balancer and why use one?",
                "answer": "A load balancer distributes incoming requests across multiple backend servers to improve throughput, availability, and fault tolerance. It can route by round-robin, least-connections, or other policies, perform health checks to skip dead servers, and terminate TLS. It's a foundational component for scaling horizontally and avoiding single points of failure."
        },
        {
                "category": "System Design",
                "question": "Design a URL shortener.",
                "answer": "Clarify scale first — reads vastly exceed writes. Core pieces: a key-generation strategy (base62 of an incrementing ID, or a hash with collision checks), a key-value store mapping short to long URLs, and a redirect service returning 301/302. Add a cache like Redis for hot links, rate limiting, analytics via an async queue, and replication or sharding for scale and availability."
        },
        {
                "category": "System Design",
                "question": "How would you scale a read-heavy service?",
                "answer": "Add layered caching: a CDN for static assets and Redis or Memcached for hot data. Introduce read replicas so reads spread across copies of the database, and consider denormalizing for the heaviest queries. Use connection pooling and asynchronous processing for non-critical work. Throughout, define your cache-invalidation strategy and monitor hit ratios and replica lag."
        },
        {
                "category": "System Design",
                "question": "Explain the CAP theorem.",
                "answer": "CAP states a distributed system can guarantee at most two of Consistency, Availability, and Partition tolerance simultaneously. Since network partitions are unavoidable, you really choose between consistency and availability during a partition. CP systems reject requests to stay consistent; AP systems stay available but may return stale data. The right choice depends on whether correctness or uptime matters more for your use case."
        },
        {
                "category": "System Design",
                "question": "How do you design a rate limiter?",
                "answer": "Pick an algorithm: fixed window is simple but bursty at boundaries; sliding window log is accurate but memory-heavy; token bucket allows bursts up to a cap and is the common choice. Store counters in a fast shared store like Redis so limits hold across server instances, key them by user or IP, and return HTTP 429 with a Retry-After header when exceeded."
        },
        {
                "category": "System Design",
                "question": "What is eventual consistency?",
                "answer": "Eventual consistency means replicas may temporarily disagree but converge to the same value once updates propagate and no new writes occur. It's common in highly available distributed systems that prioritise uptime over immediate consistency. It's acceptable where brief staleness is tolerable, like social feeds, but not for, say, bank balances that need strong consistency."
        },
        {
                "category": "System Design",
                "question": "How would you design a notification system?",
                "answer": "Decouple producers from delivery with a message queue. A service writes notification events to the queue; workers consume them and fan out to channels — push, email, SMS — via provider integrations. Add user preferences, deduplication, retries with backoff for failed sends, and rate limiting. Store delivery status for observability, and batch where possible to control cost."
        },
        {
                "category": "System Design",
                "question": "Explain caching strategies and invalidation.",
                "answer": "Common strategies are cache-aside (the app loads and populates the cache on a miss), read-through, write-through (write to cache and store together), and write-behind (write to cache, flush to store asynchronously). Invalidation options include TTL expiry, explicit deletion on write, and versioned keys. Cache invalidation is famously hard, so choose the simplest correct approach and monitor staleness."
        },
        {
                "category": "System Design",
                "question": "How do message queues help system design?",
                "answer": "A message queue decouples producers from consumers so they scale and fail independently, smooths traffic spikes by buffering work, and enables asynchronous processing of slow tasks like emails or image processing. It also improves resilience through retries and dead-letter queues. The trade-offs are added infrastructure, eventual consistency, and the need to handle duplicate or out-of-order messages."
        },
        {
                "category": "System Design",
                "question": "What is horizontal vs vertical scaling?",
                "answer": "Vertical scaling adds more power (CPU, RAM) to a single machine — simple but bounded by hardware and a single point of failure. Horizontal scaling adds more machines and distributes load, offering near-limitless growth and redundancy but requiring statelessness, load balancing, and handling distributed-systems complexity. Most large systems scale horizontally for the stateless tiers and scale data stores carefully."
        },
        {
                "category": "System Design",
                "question": "How would you design a news feed?",
                "answer": "Decide between fan-out-on-write (precompute each user's feed when someone posts, fast reads, expensive for popular accounts) and fan-out-on-read (assemble the feed at request time, cheap writes, slower reads). Many systems use a hybrid: fan-out-on-write for normal users and fan-out-on-read for celebrities. Add caching, pagination, ranking, and a store optimised for timeline reads."
        },
        {
                "category": "Web",
                "question": "Explain the difference between == and === in JavaScript.",
                "answer": "== compares values after type coercion, so '5' == 5 is true and surprising cases like 0 == false also hold. === compares value and type with no coercion, so '5' === 5 is false. Prefer === to avoid subtle bugs from implicit conversion; use == only deliberately, such as == null to catch both null and undefined."
        },
        {
                "category": "Web",
                "question": "What is the virtual DOM and why does React use it?",
                "answer": "The virtual DOM is an in-memory representation of the UI. When state changes, React builds a new virtual tree, diffs it against the previous one, and applies only the minimal set of real DOM updates. Because direct DOM manipulation is slow, batching and minimising updates this way improves performance and lets developers write declarative UI without manual DOM bookkeeping."
        },
        {
                "category": "Web",
                "question": "Explain event delegation.",
                "answer": "Event delegation attaches a single listener to a common ancestor instead of one per child, relying on event bubbling so events from children reach the parent. It reduces memory, works automatically for dynamically added elements, and simplifies cleanup. You inspect event.target to determine which child triggered it."
        },
        {
                "category": "Web",
                "question": "What is a closure in JavaScript?",
                "answer": "A closure is a function that retains access to variables from the scope in which it was created, even after that scope has returned. It's the basis for data privacy, factory functions, and callbacks that remember state. A common pitfall is closures capturing a shared loop variable, which let/const or an IIFE resolves."
        },
        {
                "category": "Web",
                "question": "Difference between localStorage, sessionStorage, and cookies.",
                "answer": "localStorage persists until explicitly cleared and isn't sent to the server. sessionStorage lasts only for the tab session. Cookies are small, sent with every HTTP request, and suit server-readable data like auth tokens — ideally with HttpOnly and Secure flags. Choose cookies for server-side auth, web storage for client-only data, and never store sensitive tokens in plain localStorage due to XSS risk."
        },
        {
                "category": "Web",
                "question": "Explain how the browser event loop works.",
                "answer": "JavaScript runs on a single thread with an event loop. Synchronous code runs first; asynchronous callbacks wait in queues. Microtasks (promises) drain completely after each synchronous chunk, before macrotasks (timers, I/O). Understanding this order explains why a resolved promise runs before a setTimeout(0) and how long-running synchronous code blocks rendering and input."
        },
        {
                "category": "Backend",
                "question": "What makes an API RESTful?",
                "answer": "REST organises an API around resources identified by URLs, manipulated with standard HTTP methods, using a uniform interface. Key constraints are statelessness (each request carries all needed context), proper use of status codes, and representations like JSON. Following these conventions makes APIs predictable, cacheable, and easy to consume."
        },
        {
                "category": "Backend",
                "question": "Explain the difference between authentication and authorization.",
                "answer": "Authentication verifies who you are — validating credentials, a token, or a session. Authorization determines what you're allowed to do once authenticated — which resources and actions are permitted. A user can be authenticated but not authorized for a given action. Systems handle authn with logins and tokens and authz with roles or permission checks on each request."
        },
        {
                "category": "Backend",
                "question": "What is JWT and what are its trade-offs?",
                "answer": "A JSON Web Token is a signed, self-contained token carrying claims like user ID and expiry, letting servers verify it without a database lookup, which suits stateless and distributed systems. The trade-off is that you can't easily revoke a token before it expires, so you keep lifetimes short, pair them with refresh tokens, and maintain a denylist for critical revocations."
        },
        {
                "category": "Backend",
                "question": "How do you prevent SQL injection?",
                "answer": "Use parameterised queries or prepared statements so user input is always treated as data, never concatenated into SQL. ORMs do this by default. Additionally validate and constrain input, apply least-privilege database accounts, and avoid building queries from raw strings. Parameterisation is the primary, reliable defence."
        },
        {
                "category": "Backend",
                "question": "What is CORS and why does it exist?",
                "answer": "Cross-Origin Resource Sharing is a browser security mechanism that controls which origins may call your API from web pages. By default the same-origin policy blocks cross-origin requests; the server opts in by returning Access-Control-Allow-Origin and related headers. It exists to stop malicious sites from silently reading authenticated responses from other domains in a user's browser."
        },
        {
                "category": "Backend",
                "question": "Explain idempotency and why it matters for APIs.",
                "answer": "An idempotent operation produces the same result whether performed once or many times. GET, PUT, and DELETE should be idempotent; POST typically isn't. It matters because networks retry requests — if a client resends a payment due to a timeout, an idempotency key lets the server recognise the duplicate and avoid charging twice. Designing for idempotency makes systems safe under retries."
        },
        {
                "category": "Backend",
                "question": "How would you store passwords securely?",
                "answer": "Never store plaintext or reversible encryption. Hash passwords with a slow, salted algorithm designed for the purpose — bcrypt, scrypt, or Argon2 — which makes brute-forcing expensive and the per-user salt defeats rainbow tables. Enforce sensible password policies, rate-limit login attempts, and consider multi-factor authentication for sensitive accounts."
        },
        {
                "category": "Backend",
                "question": "What is the difference between synchronous and asynchronous processing?",
                "answer": "Synchronous processing blocks the caller until the work finishes, which is simple but ties up resources during slow operations. Asynchronous processing hands work off — to a queue, background worker, or non-blocking I/O — and lets the caller continue, improving throughput and responsiveness. Use async for slow or bursty tasks like emails, report generation, and external API calls, accepting the added complexity of tracking completion."
        }
]

    # ── PRIMARY PATH: generate Q&A from the resume's actual skills via AI ──────
    # The category of each generated question is the skill it targets, so the
    # set is demonstrably tailored to what's on the user's resume.
    solved_qa = []
    source = "curated_fallback"
    skills_used = []
    if skills and client.available():
        solved_qa, skills_used = _generate_skill_based_qa(title, skills, target=100)
        if solved_qa:
            source = "ai_skill_based"

    # FALLBACK / TOP-UP: if AI is unavailable or returned too little, fill from
    # the curated bank (de-duplicated) so the feature always returns something.
    if len(solved_qa) < 12:
        have = {q["question"].strip().lower() for q in solved_qa}
        for q in fallback_qa:
            if len(solved_qa) >= 100:
                break
            if q["question"].strip().lower() not in have:
                solved_qa.append(q)
        if source != "ai_skill_based":
            source = "curated_fallback"

    # A ready-to-download markdown document the frontend can offer as a file.
    md_lines = [f"# Interview Prep — {title}", ""]
    md_lines.append("## Study Resources")
    for r in resources:
        md_lines.append(f"### {r['topic']}")
        for it in r["items"]:
            md_lines.append(f"- [{it['name']}]({it['url']})")
        md_lines.append("")
    md_lines.append("## Solved Questions & Answers")
    for i, qa in enumerate(solved_qa, 1):
        md_lines.append(f"**{i}. [{qa['category']}] {qa['question']}**")
        md_lines.append("")
        md_lines.append(qa["answer"])
        md_lines.append("")
    download_markdown = "\n".join(md_lines)

    return {
        "role": title,
        "source": source,                 # "ai_skill_based" | "curated_fallback"
        "skills_used": skills_used or skills,
        "resources": resources,
        "solved_qa": solved_qa,
        "total_questions": len(solved_qa),
        "download_markdown": download_markdown,
        "download_filename": f"interview-prep-{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')}.md",
    }
