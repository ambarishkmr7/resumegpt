"""AI-powered features. Each function degrades gracefully when no API key is
set, so the app remains fully usable (just without the AI niceties)."""
import json
import logging
import re

from app.ai import client
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


def _gemini_complete_json(prompt: str, system: str = "", max_tokens: int = 2000) -> dict:
    """Send a prompt to Gemini 2.5 Flash and parse JSON response."""
    from google.genai import types
    client = _gemini_client()
    system_instruction = system if system else None
    response = client.models.generate_content(
        model="gemini-flash-lite-latest",
        contents=[prompt],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=max_tokens,
            temperature=0.7,
        ),
    )
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
    return client.complete(prompt, system=system, max_tokens=900)


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
        data = client.complete_json(prompt, system=system, max_tokens=3000)
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
        data = _gemini_complete_json(prompt, system=system, max_tokens=2500)
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
        data = _gemini_complete_json(prompt, system=system, max_tokens=3000)
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
        return client.complete_json(prompt, system=system, max_tokens=2500)
    except Exception:
        return suggest_jobs(content, target_role, location)

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
    return client.complete(prompt, system=system, max_tokens=600)


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
        data = client.complete_json(prompt, system=system, max_tokens=6000)
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
            ai_content = client.complete_json(prompt, system=system, max_tokens=3000)
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
            text = gemini_client.chat(conv, system=system_prompt, max_tokens=1000)
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
            return client.complete_json(prompt, system=system_prompt, max_tokens=800)
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
            f"**Mock interviews:** Use ResumeGPT Mock Interview, Pramp.com (free), interviewing.io")
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
            f"• Customize your resume per application using ResumeGPT AI Rewrite\n\n"
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
            f"• Use ResumeGPT AI Improve for instant enhancement\n\n"
            f"**LinkedIn optimization:**\n"
            f"• Headline: '{title} | {skills[0] if skills else 'Tech'} | Open to opportunities'\n"
            f"• About: Use ResumeGPT Professional Writeup generator\n"
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
            f"• Use ResumeGPT to refresh your resume with latest achievements\n"
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
            result = gemini_client.complete_json(prompt, system="Expert interview coach. Be specific and actionable.", max_tokens=1000)
            if isinstance(result, dict) and "score" in result:
                return result
        except Exception:
            pass

    return base_result


# 4. AI Job Agent
def ai_job_agent(content: ResumeContent, target_role: str = None, location: str = None, preferences: dict = None) -> dict:
    """AI agent that finds relevant jobs and prepares application materials."""
    from app.ai import gemini as gemini_client
    from urllib.parse import quote_plus

    name = content.contact.name or "Candidate"
    title = target_role or content.contact.title or "Software Engineer"
    skills = content.skills[:10]
    location = location or content.contact.location or "India"
    q = quote_plus(title)
    loc = quote_plus(location)

    # Job search URLs
    job_sources = [
        {"platform": "LinkedIn", "url": f"https://www.linkedin.com/jobs/search/?keywords={q}&location={loc}", "icon": "🔗"},
        {"platform": "Naukri", "url": f"https://www.naukri.com/{q.replace('+','-')}-jobs-in-{loc.replace('+','-')}", "icon": "📋"},
        {"platform": "Indeed", "url": f"https://www.indeed.co.in/jobs?q={q}&l={loc}", "icon": "🔍"},
        {"platform": "RemoteJobs.in", "url": f"https://www.remotejobs.in/search?q={q}", "icon": "🌍"},
        {"platform": "Glassdoor", "url": f"https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword={q}&locT=C&locKeyword={loc}", "icon": "⭐"},
    ]

    # Generate target company job listings
    COMPANY_DB = {
        "Software Engineer": [
            {"company":"Google","role":"Software Engineer","location":"Bangalore","glassdoor":"4.4","match":"World-class engineering culture, strong in "+skills[0] if skills else "tech"},
            {"company":"Microsoft","role":"SDE","location":"Hyderabad","glassdoor":"4.2","match":"Great WLB, strong "+skills[0] if skills else "tech"+" ecosystem"},
            {"company":"Amazon","role":"SDE","location":"Bangalore","glassdoor":"3.9","match":"Scale challenges, leadership principles"},
            {"company":"Flipkart","role":"SDE-2","location":"Bangalore","glassdoor":"4.0","match":"India's top product company"},
            {"company":"Razorpay","role":"Backend Engineer","location":"Bangalore","glassdoor":"4.1","match":"Fintech leader, fast-paced"},
            {"company":"Swiggy","role":"Software Engineer","location":"Bangalore","glassdoor":"3.8","match":"Large-scale distributed systems"},
            {"company":"PhonePe","role":"SDE","location":"Bangalore","glassdoor":"4.0","match":"UPI/payments at massive scale"},
            {"company":"Atlassian","role":"Software Engineer","location":"Bangalore","glassdoor":"4.3","match":"Excellent culture, remote-friendly"},
            {"company":"Uber","role":"Software Engineer","location":"Hyderabad","glassdoor":"4.0","match":"Global scale, strong engineering"},
            {"company":"Zomato","role":"SDE","location":"Gurgaon","glassdoor":"3.7","match":"Consumer tech at scale"},
        ],
        "Data Scientist": [
            {"company":"Google","role":"Data Scientist","location":"Bangalore","glassdoor":"4.4","match":"Best ML infrastructure"},
            {"company":"Amazon","role":"Applied Scientist","location":"Bangalore","glassdoor":"3.9","match":"ML at massive scale"},
            {"company":"Microsoft","role":"Data Scientist","location":"Hyderabad","glassdoor":"4.2","match":"Azure ML, research opportunities"},
            {"company":"Flipkart","role":"Data Scientist","location":"Bangalore","glassdoor":"4.0","match":"Recommendation, search, pricing ML"},
            {"company":"Myntra","role":"ML Engineer","location":"Bangalore","glassdoor":"3.9","match":"Fashion ML, computer vision"},
        ],
    }

    # Get best matching companies
    role_key = next((k for k in COMPANY_DB if k.lower() in title.lower()), "Software Engineer")
    companies = COMPANY_DB.get(role_key, COMPANY_DB["Software Engineer"])

    job_listings = []
    for c in companies:
        cq = quote_plus(f"{c['role']} {c['company']}")
        job_listings.append({
            "company": c["company"],
            "role": c["role"],
            "location": c.get("location", location),
            "glassdoor_rating": c.get("glassdoor", "N/A"),
            "match_reason": c["match"],
            "apply_urls": {
                "linkedin": f"https://www.linkedin.com/jobs/search/?keywords={cq}&location={quote_plus(c.get('location',location))}",
                "naukri": f"https://www.naukri.com/{cq.replace('+','-')}-jobs",
                "indeed": f"https://www.indeed.co.in/jobs?q={cq}",
            },
            "status": "ready",
        })

    # Cover letter
    cover_letter = (
        f"Dear Hiring Manager,\n\n"
        f"I am writing to express my strong interest in the {title} position. "
        f"With {len(content.experience)} roles and expertise in {', '.join(skills[:5])}, "
        f"I am confident in my ability to make a meaningful contribution.\n\n"
        f"In my most recent role, I {content.experience[0].bullets[0].lower() if content.experience and content.experience[0].bullets else 'delivered impactful results'}. "
        f"I am drawn to this opportunity for the chance to apply my skills at scale.\n\n"
        f"I look forward to discussing how my experience aligns with your needs.\n\n"
        f"Best regards,\n{name}"
    )

    # Recruiter Q&A
    recruiter_qa = [
        {"question": "Why are you looking for a change?", "answer": f"I'm seeking to leverage my {', '.join(skills[:3])} expertise at a larger scale with more strategic responsibilities."},
        {"question": "Salary expectations?", "answer": f"I'm open to discussing compensation reflecting market standards for a {title} with my experience. I'd like to understand the full package."},
        {"question": "Notice period?", "answer": "I can discuss flexibility based on the opportunity. I'll ensure a smooth transition."},
        {"question": "Why should we hire you?", "answer": f"I bring {len(content.experience)} roles of experience in {', '.join(skills[:4])} with a track record of measurable results and continuous learning."},
    ]

    # Try Gemini for personalized cover letter
    if gemini_client.available():
        try:
            prompt = f"Write a professional cover letter for {name} applying for {title}. Skills: {', '.join(skills)}. Keep it under 150 words. Return just the letter text."
            ai_letter = gemini_client.complete(prompt, system="Professional cover letter writer.", max_tokens=500)
            if len(ai_letter) > 50:
                cover_letter = ai_letter
        except Exception:
            pass

    return {
        "status": "ready",
        "target_role": title,
        "location": location,
        "job_sources": job_sources,
        "job_listings": job_listings,
        "cover_letter": cover_letter,
        "recruiter_qa": recruiter_qa,
        "tips": [
            "Customize the cover letter for each company",
            "Research the company before applying",
            "Apply within 48 hours of posting for 3x more callbacks",
            "Follow up within 1 week of applying",
            "Connect with the hiring manager on LinkedIn",
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
        data = client.complete_json(prompt, system=system, max_tokens=2500)
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
