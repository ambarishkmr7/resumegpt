"""AI-powered features. Each function degrades gracefully when no API key is
set, so the app remains fully usable (just without the AI niceties)."""
import json
import logging
import re

from app.ai import client
from app.schemas import ResumeContent
from app.resumes.ats import score_resume
logger = logging.getLogger(__name__)


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
        # Deterministic fallback when no AI key is configured
        strengths, weaknesses, recs = [], [], []
        if content.experience:
            strengths.append(f"Demonstrates {len(content.experience)} role(s) of professional experience.")
        if quantified > 2:
            strengths.append(f"{quantified} bullet points include quantified achievements (numbers, %, $).")
        if content.skills and len(content.skills) >= 5:
            strengths.append(f"Comprehensive skills section with {len(content.skills)} technologies listed.")
        if content.certifications:
            strengths.append(f"Holds {len(content.certifications)} certification(s) validating expertise.")
        if not content.summary:
            weaknesses.append("Professional summary is missing or too brief.")
        if total_bullets > 0 and quantified == 0:
            weaknesses.append("No quantified achievements found. Numbers make bullets 40% more impactful.")
        if not content.certifications:
            weaknesses.append("No certifications listed — they validate skills and boost ATS scores.")
        for issue in result.issues:
            recs.append(issue.suggestion)
        recs.append("Tailor your resume for each application: match keywords from the job description.")
        return dict(
            strengths=strengths[:6] or ["Resume has basic sections filled."],
            weaknesses=weaknesses[:6] or ["No critical issues detected."],
            recommendations=recs[:8],
            overall_assessment=f"ATS Score: {result.score}/100. {'Excellent' if result.score >= 85 else 'Good' if result.score >= 70 else 'Needs work'} resume. Impact evidence: {quantified}/{total_bullets} quantified bullets.",
        )

    # LLM-powered analysis with structured JSON output
    system = (
        "You are a senior career coach, hiring manager, and ATS expert with 15+ years of experience. "
        "Analyze the resume deeply and provide specific, actionable insights — not generic advice. "
        "Reference specific details from the resume in your analysis."
    )
    prompt = (
        "Deeply analyze this resume. Evaluate:\n"
        "- Quantified achievements vs vague statements\n"
        "- Action verb usage and impact language\n"
        "- Skill gaps relative to current market demand\n"
        "- Career progression (title growth, scope increase)\n"
        "- Personal branding consistency\n"
        "- ATS optimization opportunities\n\n"
        "Return a JSON object with these exact keys:\n"
        "- strengths: array of 5-6 strings (specific things done well, with evidence)\n"
        "- weaknesses: array of 5-6 strings (specific gaps with examples)\n"
        "- recommendations: array of 8-10 strings (actionable steps, prioritized)\n"
        "- overall_assessment: string (2-3 paragraph thorough assessment)\n\n"
        f"JOB DESCRIPTION (optional):\n{job_description or 'General analysis'}\n\n"
        f"RESUME JSON:\n{content.model_dump_json(indent=2)}\n\n"
        "Return ONLY the JSON object, no markdown or extra text."
    )
    try:
        data = _gemini_complete_json(prompt, system=system, max_tokens=2500)
        return dict(
            strengths=data.get("strengths", [])[:8],
            weaknesses=data.get("weaknesses", [])[:8],
            recommendations=data.get("recommendations", [])[:12],
            overall_assessment=data.get("overall_assessment", ""),
        )
    except Exception as e:
        logger.warning("AI career analysis failed: %s, using deterministic fallback", e)
        # Return deterministic fallback
        return _deterministic_analysis(content, job_description, result, total_bullets, quantified)


def _deterministic_analysis(content, job_description, result, total_bullets, quantified):
    """Deterministic fallback for career analysis when AI is unavailable."""
    strengths, weaknesses, recs = [], [], []
    if content.experience:
        strengths.append(f"Demonstrates {len(content.experience)} role(s) of professional experience.")
    if quantified > 2:
        strengths.append(f"{quantified} bullet points include quantified achievements (numbers, %, $).")
    if content.skills and len(content.skills) >= 5:
        strengths.append(f"Comprehensive skills section with {len(content.skills)} technologies listed.")
    if content.certifications:
        strengths.append(f"Holds {len(content.certifications)} certification(s) validating expertise.")
    if not content.summary:
        weaknesses.append("Professional summary is missing or too brief.")
    if total_bullets > 0 and quantified == 0:
        weaknesses.append("No quantified achievements found. Numbers make bullets 40% more impactful.")
    if not content.certifications:
        weaknesses.append("No certifications listed — they validate skills and boost ATS scores.")
    for issue in result.issues:
        recs.append(issue.suggestion)
    recs.append("Tailor your resume for each application: match keywords from the job description.")
    return dict(
        strengths=strengths[:6] or ["Resume has basic sections filled."],
        weaknesses=weaknesses[:6] or ["No critical issues detected."],
        recommendations=recs[:8],
        overall_assessment=(
            f"ATS Score: {result.score}/100. "
            f"{'Excellent' if result.score >= 85 else 'Good' if result.score >= 70 else 'Needs work'} resume. "
            f"Impact evidence: {quantified}/{total_bullets} quantified bullets."
        ),
    )


def _deterministic_roadmap(content, current_title):
    """Deterministic fallback for career roadmap when AI is unavailable."""
    from urllib.parse import quote_plus
    skill_query = quote_plus(current_title)
    return dict(
        current_level=current_title,
        next_roles=[f"Senior {current_title}", f"Lead {current_title}", f"Staff {current_title}"],
        roadmap_steps=[
            "Deepen expertise in 1-2 core technologies.",
            "Take on cross-functional or leadership projects.",
            "Earn relevant industry certifications.",
            "Build a portfolio of measurable achievements.",
            "Network and seek mentorship in target domain.",
        ],
        recommended_certifications=[],
        skill_gaps=["Leadership and mentorship", "System design at scale", "Cross-team communication"],
        timeline="12-24 months for next-level transition.",
        youtube_channels=[],
        learning_resources=[
            dict(platform="Coursera", url=f"https://www.coursera.org/search?query={skill_query}", description="University-level courses"),
            dict(platform="Udemy", url=f"https://www.udemy.com/courses/search/?q={skill_query}", description="Affordable practical courses"),
        ],
    )


# ---------------- Career roadmap ----------------

def career_roadmap(content: ResumeContent, target_role=None) -> dict:
    """Generate a career roadmap with certifications, skill gaps, and learning resources."""
    current_title = content.contact.title or (content.experience[0].title if content.experience else "Professional")

    if not client.available():
        # Deterministic fallback
        from urllib.parse import quote_plus
        skill_query = quote_plus(current_title)
        return dict(
            current_level=current_title,
            next_roles=[f"Senior {current_title}", f"Lead {current_title}", f"Staff {current_title}"],
            roadmap_steps=[
                "Deepen expertise in 1-2 core technologies.",
                "Take on cross-functional or leadership projects.",
                "Earn relevant industry certifications.",
                "Build a portfolio of measurable achievements.",
                "Network and seek mentorship in target domain.",
            ],
            recommended_certifications=[],
            skill_gaps=["Leadership and mentorship", "System design at scale", "Cross-team communication"],
            timeline="12-24 months for next-level transition.",
            youtube_channels=[],
            learning_resources=[
                dict(platform="Coursera", url=f"https://www.coursera.org/search?query={skill_query}", description="University-level courses"),
                dict(platform="Udemy", url=f"https://www.udemy.com/courses/search/?q={skill_query}", description="Affordable practical courses"),
            ],
        )

    # LLM-powered roadmap with structured JSON output
    system = (
        "You are a senior career strategist and tech industry expert. "
        "Create a concrete, actionable career roadmap with specific recommendations. "
        "Include real certification names, real YouTube channels, and real course platform links."
    )
    prompt = (
        f"Create a detailed career roadmap for this professional.\n"
        f"Current role: {current_title}\n"
        f"Target role: {target_role or 'next logical career step'}\n\n"
        f"RESUME JSON:\n{content.model_dump_json(indent=2)}\n\n"
        "Return a JSON object with these exact keys:\n"
        "- current_level: string (assessment of current career stage)\n"
        "- next_roles: array of 3-4 strings (specific next job titles)\n"
        "- roadmap_steps: array of 6-8 strings (concrete action items)\n"
        "- recommended_certifications: array of objects with keys: name, institution, description, udemy_url\n"
        "- skill_gaps: array of 4-6 strings (skills to develop)\n"
        "- timeline: string (realistic timeline for next transition)\n"
        "- youtube_channels: array of objects with keys: name, url, topic\n"
        "- learning_resources: array of objects with keys: platform, url, description\n\n"
        "Return ONLY the JSON object, no markdown or extra text."
    )
    try:
        data = _gemini_complete_json(prompt, system=system, max_tokens=3000)
        return dict(
            current_level=data.get("current_level", current_title),
            next_roles=data.get("next_roles", [])[:6],
            roadmap_steps=data.get("roadmap_steps", [])[:10],
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
    """Generate 50+ interview questions organized by category."""
    from app.ai import gemini as gemini_client
    target = role or content.contact.title or "Software Engineer"
    skills = content.skills[:10]
    primary = skills[0] if skills else "programming"
    exp = [f"{e.title} at {e.company}" for e in content.experience[:3]]
    exp_years = max(len(content.experience) * 2, 1)

    # Build comprehensive question bank
    behavioral = [
        {"id":1,"type":"behavioral","category":"Leadership","question":"Tell me about a time you led a project with tight deadlines. How did you prioritize?","tips":"Use STAR. Show decision-making and delegation."},
        {"id":2,"type":"behavioral","category":"Leadership","question":"Describe a time you mentored a junior team member who was struggling.","tips":"Show empathy, patience, and measurable improvement in their performance."},
        {"id":3,"type":"behavioral","category":"Conflict","question":"Tell me about a disagreement with your manager. How did you handle it?","tips":"Show maturity — listen first, present data, find common ground."},
        {"id":4,"type":"behavioral","category":"Conflict","question":"Describe a situation where two team members had conflicting approaches. How did you resolve it?","tips":"Show facilitation skills — acknowledge both views, find the best solution."},
        {"id":5,"type":"behavioral","category":"Failure","question":"Tell me about your biggest professional failure. What did you learn?","tips":"Own the mistake, focus 70% on what you learned and changed."},
        {"id":6,"type":"behavioral","category":"Failure","question":"Describe a project that didn't meet its goals. What would you do differently?","tips":"Show self-awareness and growth mindset."},
        {"id":7,"type":"behavioral","category":"Achievement","question":"What's your proudest professional achievement? Walk me through it.","tips":"Pick one with measurable impact. Quantify the result."},
        {"id":8,"type":"behavioral","category":"Achievement","question":"Tell me about a time you exceeded expectations on a deliverable.","tips":"Show initiative — what extra steps did you take?"},
        {"id":9,"type":"behavioral","category":"Teamwork","question":"Describe a time you worked with a cross-functional team. What was your role?","tips":"Show collaboration across engineering, product, design, etc."},
        {"id":10,"type":"behavioral","category":"Teamwork","question":"How do you handle a team member who isn't pulling their weight?","tips":"Show empathy first, then accountability with specific examples."},
        {"id":11,"type":"behavioral","category":"Pressure","question":"Tell me about working under extreme pressure. How did you manage?","tips":"Show composure, prioritization, and successful delivery."},
        {"id":12,"type":"behavioral","category":"Communication","question":"Describe a time you had to explain a complex technical concept to a non-technical stakeholder.","tips":"Show ability to simplify without losing accuracy."},
    ]

    technical = [
        {"id":13,"type":"technical","category":"System Design","question":f"Design a scalable notification system that handles 10M users using {primary}.","tips":"Cover: message queue, push/email/SMS channels, user preferences, rate limiting."},
        {"id":14,"type":"technical","category":"System Design","question":"Design a URL shortener like bit.ly. Walk me through the architecture.","tips":"Cover: hashing, storage, redirection, analytics, cache layer."},
        {"id":15,"type":"technical","category":"System Design","question":"How would you design a real-time chat application?","tips":"Cover: WebSockets, message persistence, presence, delivery guarantees."},
        {"id":16,"type":"technical","category":"System Design","question":"Design an e-commerce platform's order processing pipeline.","tips":"Cover: order states, payment, inventory, retry logic, eventual consistency."},
        {"id":17,"type":"technical","category":"System Design","question":"Design a content delivery network (CDN). How would you minimize latency?","tips":"Cover: edge nodes, cache invalidation, origin servers, DNS routing."},
        {"id":18,"type":"technical","category":"Coding","question":f"How would you implement rate limiting in a {primary} API?","tips":"Discuss: token bucket, sliding window, Redis-based, middleware patterns."},
        {"id":19,"type":"technical","category":"Coding","question":f"Write a function to find the longest substring without repeating characters.","tips":"Use sliding window technique. Discuss time/space complexity."},
        {"id":20,"type":"technical","category":"Coding","question":"How would you implement a LRU cache from scratch?","tips":"Use doubly-linked list + hashmap. Explain O(1) get/put."},
        {"id":21,"type":"technical","category":"Architecture","question":f"Explain microservices vs monolith. When would you choose each for {primary}?","tips":"Discuss team size, deployment, complexity, data consistency trade-offs."},
        {"id":22,"type":"technical","category":"Architecture","question":"How do you handle database migrations in production without downtime?","tips":"Blue-green, rolling updates, backward-compatible migrations, feature flags."},
        {"id":23,"type":"technical","category":"DevOps","question":"Walk me through your ideal CI/CD pipeline.","tips":"Source → build → test → stage → deploy. Include rollback strategy."},
        {"id":24,"type":"technical","category":"DevOps","question":"How would you debug a production incident where API latency spiked 10x?","tips":"Monitoring → logs → traces → identify bottleneck → fix → postmortem."},
        {"id":25,"type":"technical","category":"Database","question":"When would you choose SQL vs NoSQL? Give specific examples.","tips":"SQL: transactions, joins. NoSQL: scale, flexible schema, high write throughput."},
        {"id":26,"type":"technical","category":"Database","question":"Explain database indexing. How do you decide what to index?","tips":"B-tree, hash index, composite. Index: WHERE/JOIN columns, not low-selectivity."},
        {"id":27,"type":"technical","category":"Security","question":"How do you prevent SQL injection and XSS in your applications?","tips":"Parameterized queries, input sanitization, CSP headers, escape output."},
        {"id":28,"type":"technical","category":"Security","question":"Explain OAuth2 flow. How would you implement authentication in a REST API?","tips":"Authorization code flow, JWT tokens, refresh tokens, RBAC."},
    ]

    situational = [
        {"id":29,"type":"situational","category":"Decision Making","question":f"If you joined as {target}, what would your first 90 days look like?","tips":"Listen → Learn → Quick wins. Show strategic thinking."},
        {"id":30,"type":"situational","category":"Decision Making","question":"Your team wants to adopt a new framework but the deadline is in 3 weeks. What do you do?","tips":"Assess risk, propose a phased approach, communicate trade-offs clearly."},
        {"id":31,"type":"situational","category":"Decision Making","question":"You find a critical bug in production on a Friday evening. What's your process?","tips":"Severity assessment, quick fix vs rollback, communication, postmortem."},
        {"id":32,"type":"situational","category":"Priority","question":"You have 3 urgent tasks from 3 different stakeholders. How do you prioritize?","tips":"Impact vs effort matrix, communicate timelines, negotiate deadlines."},
        {"id":33,"type":"situational","category":"Priority","question":"Your sprint has 20 story points but the PM added 10 more mid-sprint. What do you do?","tips":"Push back with data, negotiate scope, protect team's sustainability."},
        {"id":34,"type":"situational","category":"Ethics","question":"You discover a colleague is padding their work hours. How do you handle it?","tips":"Private conversation first, then escalate if needed. Focus on impact, not judgment."},
        {"id":35,"type":"situational","category":"Ethics","question":"A client asks you to ship a feature you know has security vulnerabilities. What do you do?","tips":"Document the risk, propose alternatives, escalate to leadership if overruled."},
        {"id":36,"type":"situational","category":"Innovation","question":"How would you introduce AI/ML capabilities into your current project?","tips":"Identify use cases with clear ROI, start with a POC, measure impact."},
        {"id":37,"type":"situational","category":"Innovation","question":"Your tech stack is 5 years old. How would you propose modernization?","tips":"Incremental migration, strangler fig pattern, business case with metrics."},
        {"id":38,"type":"situational","category":"Client","question":"A client is unhappy with the deliverable quality. How do you handle the conversation?","tips":"Acknowledge, apologize, action plan. Show ownership without making excuses."},
    ]

    role_specific = [
        {"id":39,"type":"role_specific","category":f"{primary}","question":f"What are the key differences between {primary} and its alternatives? Why do you prefer it?","tips":"Show depth — discuss pros, cons, and when you'd choose differently."},
        {"id":40,"type":"role_specific","category":f"{primary}","question":f"What's a common performance pitfall in {primary} and how do you avoid it?","tips":"Show real-world experience with profiling, optimization, and best practices."},
        {"id":41,"type":"role_specific","category":"Culture Fit","question":"What kind of engineering culture do you thrive in?","tips":"Be genuine — discuss collaboration, autonomy, learning, code review preferences."},
        {"id":42,"type":"role_specific","category":"Culture Fit","question":"How do you stay updated with new technologies?","tips":"Blogs, conferences, side projects, communities — be specific."},
        {"id":43,"type":"role_specific","category":"Growth","question":"Where do you see yourself in 3-5 years?","tips":"Show ambition + realism. IC track or management — both are valid."},
        {"id":44,"type":"role_specific","category":"Growth","question":"What's the most valuable feedback you've ever received?","tips":"Show self-awareness and how you acted on it."},
        {"id":45,"type":"role_specific","category":"Motivation","question":"Why are you leaving your current role?","tips":"Growth-focused. NEVER badmouth current employer."},
        {"id":46,"type":"role_specific","category":"Motivation","question":"What excites you about this role specifically?","tips":"Research the company. Mention specific projects/tech/values."},
        {"id":47,"type":"role_specific","category":"Problem Solving","question":"Walk me through how you approach debugging a complex issue.","tips":"Reproduce → isolate → hypothesize → test → fix → prevent. Systematic approach."},
        {"id":48,"type":"role_specific","category":"Problem Solving","question":"Describe the most complex technical problem you've solved.","tips":"Show depth of investigation, creativity, and measurable outcome."},
        {"id":49,"type":"role_specific","category":"Estimation","question":"How do you estimate the effort for a new feature?","tips":"Break down into tasks, add buffer, consider unknowns. T-shirt sizing or story points."},
        {"id":50,"type":"role_specific","category":"Estimation","question":"A task you estimated at 1 week is taking 3 weeks. What do you do?","tips":"Communicate early, identify blockers, re-scope if needed."},
        {"id":51,"type":"role_specific","category":"Code Quality","question":"What does 'clean code' mean to you? Give examples.","tips":"Readable, testable, maintainable. SOLID principles, meaningful names, small functions."},
        {"id":52,"type":"role_specific","category":"Code Quality","question":"How do you approach code reviews? What do you look for?","tips":"Correctness, readability, edge cases, performance, testing. Be constructive."},
        {"id":53,"type":"role_specific","category":"Testing","question":"How much test coverage is enough? What types of tests do you write?","tips":"Unit > Integration > E2E. 80%+ coverage on critical paths. Test behavior, not implementation."},
        {"id":54,"type":"role_specific","category":"Agile","question":"What's your experience with Agile/Scrum? What works and what doesn't?","tips":"Show practical experience — standups, retros, sprint planning. Be honest about pain points."},
        {"id":55,"type":"role_specific","category":"Agile","question":"How do you handle changing requirements mid-sprint?","tips":"Assess impact, negotiate with PO, protect team velocity, document changes."},
    ]

    # Combine all questions
    all_questions = behavioral + technical + situational + role_specific

    # Filter by category if specified
    if category != "all":
        cat_lower = category.lower()
        all_questions = [q for q in all_questions if q["type"] == cat_lower or q.get("category","").lower() == cat_lower]

    # If Gemini is available, generate additional personalized questions
    if gemini_client.available() and len(all_questions) < question_count:
        try:
            prompt = (
                f"Generate 10 unique interview questions for a {target} role.\n"
                f"Skills: {', '.join(skills)}\nExperience: {'; '.join(exp)}\n"
                f"Mix of behavioral, technical, and situational. Make them specific to {primary}.\n"
                f"Return JSON array: [{{\"id\":56,\"type\":\"technical\",\"category\":\"...\",\"question\":\"...\",\"tips\":\"...\"}}]"
            )
            extra = gemini_client.complete_json(prompt, system="Generate interview questions. Return JSON array only.", max_tokens=2000)
            if isinstance(extra, list):
                for i, q in enumerate(extra):
                    q["id"] = len(all_questions) + i + 1
                    all_questions.append(q)
        except Exception:
            pass

    # Limit to requested count
    questions = all_questions[:min(question_count, len(all_questions))]

    # Get unique categories for filtering
    categories = sorted(set(q.get("category","") for q in all_questions if q.get("category")))

    return {
        "role": target,
        "difficulty": difficulty,
        "total_questions": len(all_questions),
        "questions": questions,
        "categories": categories,
        "types": ["behavioral","technical","situational","role_specific"],
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
# ─────────────────────────────────────────────────────────────

TRENDING_JOBS_DB = {
    "software_engineer": [
        dict(
            title="Senior Full-Stack Engineer (AI-integrated)",
            category="Software Engineering",
            demand_level="🔥 Very High",
            avg_salary="₹25-50 LPA",
            description="Build AI-powered web products. Companies are rapidly integrating LLMs into their core products and need engineers who can bridge traditional web engineering with AI/ML APIs.",
            tech_stack=["React / Next.js", "Node.js / FastAPI", "OpenAI / Anthropic APIs", "PostgreSQL", "Redis", "Docker", "AWS / GCP"],
            match_score=85,
            certifications=[
                dict(name="AWS Certified Developer – Associate", provider="Amazon Web Services",
                     url="https://aws.amazon.com/certification/certified-developer-associate/"),
                dict(name="Meta Front-End Developer Certificate", provider="Meta via Coursera",
                     url="https://www.coursera.org/professional-certificates/meta-front-end-developer"),
                dict(name="Full Stack Development Bootcamp", provider="Scaler Academy",
                     url="https://www.scaler.com/courses/full-stack-developer/"),
            ],
            hiring_companies=[
                dict(name="Anthropic"), dict(name="Google DeepMind"), dict(name="Flipkart"),
                dict(name="Meesho"), dict(name="Razorpay"), dict(name="Zepto"),
            ],
        ),
        dict(
            title="Backend Engineer – Distributed Systems",
            category="Software Engineering",
            demand_level="🔥 Very High",
            avg_salary="₹20-45 LPA",
            description="Design and scale backend infrastructure handling millions of requests. Companies like Zomato, Swiggy, PhonePe are constantly scaling their systems to handle India's internet growth.",
            tech_stack=["Go / Rust / Java", "Kafka / RabbitMQ", "Kubernetes", "gRPC", "Cassandra / ScyllaDB", "Prometheus / Grafana"],
            match_score=78,
            certifications=[
                dict(name="Certified Kubernetes Administrator (CKA)", provider="CNCF",
                     url="https://www.cncf.io/certification/cka/"),
                dict(name="System Design Interview Course", provider="Scaler",
                     url="https://www.scaler.com/courses/system-design/"),
            ],
            hiring_companies=[
                dict(name="Zomato"), dict(name="PhonePe"), dict(name="Swiggy"),
                dict(name="CRED"), dict(name="Groww"), dict(name="Juspay"),
            ],
        ),
    ],
    "data": [
        dict(
            title="Data Scientist / ML Engineer",
            category="Data & AI",
            demand_level="🔥 Very High",
            avg_salary="₹18-40 LPA",
            description="Build and productionize ML models. 2025-26 sees explosive demand for engineers who can take models from notebook to production — model serving, feature stores, and MLOps.",
            tech_stack=["Python", "PyTorch / TensorFlow", "Scikit-learn", "MLflow / W&B", "Spark", "Airflow", "AWS SageMaker"],
            match_score=80,
            certifications=[
                dict(name="TensorFlow Developer Certificate", provider="Google",
                     url="https://www.tensorflow.org/certificate"),
                dict(name="AWS Machine Learning Specialty", provider="AWS",
                     url="https://aws.amazon.com/certification/certified-machine-learning-specialty/"),
                dict(name="IBM Data Science Professional Certificate", provider="IBM via Coursera",
                     url="https://www.coursera.org/professional-certificates/ibm-data-science"),
            ],
            hiring_companies=[
                dict(name="Google"), dict(name="Microsoft"), dict(name="Amazon"),
                dict(name="Sarvam AI"), dict(name="Krutrim"), dict(name="Wadhwani AI"),
            ],
        ),
        dict(
            title="Analytics Engineer / Data Platform",
            category="Data Engineering",
            demand_level="High",
            avg_salary="₹15-32 LPA",
            description="Bridge between raw data and business insights. dbt, modern data stacks, and real-time analytics are transforming how companies use data. High demand from e-commerce and fintech.",
            tech_stack=["dbt", "Snowflake / BigQuery", "Airflow", "Kafka", "Looker / Metabase", "Python", "Spark"],
            match_score=72,
            certifications=[
                dict(name="dbt Analytics Engineering Certification", provider="dbt Labs",
                     url="https://www.getdbt.com/certifications/analytics-engineer/"),
                dict(name="Google Cloud Professional Data Engineer", provider="Google Cloud",
                     url="https://cloud.google.com/certification/data-engineer"),
            ],
            hiring_companies=[
                dict(name="Razorpay"), dict(name="Myntra"), dict(name="Urban Company"),
                dict(name="Nykaa"), dict(name="ShareChat"),
            ],
        ),
    ],
    "devops": [
        dict(
            title="Platform / DevOps Engineer",
            category="Infrastructure & DevOps",
            demand_level="🔥 Very High",
            avg_salary="₹20-45 LPA",
            description="Build developer platforms, CI/CD pipelines, and cloud infrastructure. Platform engineering is the fastest growing discipline in tech — every startup building at scale needs this.",
            tech_stack=["Kubernetes", "Terraform", "ArgoCD", "GitHub Actions", "Prometheus / Grafana", "AWS / GCP / Azure", "Helm"],
            match_score=82,
            certifications=[
                dict(name="Certified Kubernetes Administrator (CKA)", provider="CNCF",
                     url="https://www.cncf.io/certification/cka/"),
                dict(name="HashiCorp Terraform Associate", provider="HashiCorp",
                     url="https://www.hashicorp.com/certifications/terraform-associate"),
                dict(name="AWS DevOps Engineer Professional", provider="AWS",
                     url="https://aws.amazon.com/certification/certified-devops-engineer-professional/"),
            ],
            hiring_companies=[
                dict(name="Atlassian"), dict(name="Harness"), dict(name="Postman"),
                dict(name="Freshworks"), dict(name="Hasura"), dict(name="Dgraph Labs"),
            ],
        ),
    ],
    "ai": [
        dict(
            title="LLM / Generative AI Engineer",
            category="Generative AI",
            demand_level="🔥 Explosive",
            avg_salary="₹30-80 LPA",
            description="The hottest role of 2025-26. Build RAG pipelines, fine-tune LLMs, design prompt engineering frameworks, and deploy AI agents. India's AI startups are hiring at a premium.",
            tech_stack=["LangChain / LlamaIndex", "OpenAI / Anthropic / Gemini APIs", "Vector DBs (Pinecone, Weaviate)", "Python", "FastAPI", "HuggingFace", "RLHF"],
            match_score=70,
            certifications=[
                dict(name="DeepLearning.AI LLM Specialization", provider="Coursera + DeepLearning.AI",
                     url="https://www.coursera.org/specializations/large-language-models"),
                dict(name="Generative AI with LLMs", provider="AWS + DeepLearning.AI",
                     url="https://www.coursera.org/learn/generative-ai-with-llms"),
                dict(name="Prompt Engineering for Developers", provider="DeepLearning.AI (Free)",
                     url="https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/"),
            ],
            hiring_companies=[
                dict(name="Anthropic"), dict(name="Sarvam AI"), dict(name="Krutrim"),
                dict(name="Ola Krutrim"), dict(name="Fractal Analytics"), dict(name="Tiger Analytics"),
            ],
        ),
    ],
    "management": [
        dict(
            title="Engineering Manager / Tech Lead",
            category="Leadership",
            demand_level="High",
            avg_salary="₹35-80 LPA",
            description="Lead engineering teams of 6-15 people. Companies scaling from Series B onwards are actively searching for EMs who can ship fast, build culture, and communicate with business stakeholders.",
            tech_stack=["Jira / Linear", "System Design", "OKR frameworks", "1:1 best practices", "DORA metrics", "Tech roadmapping"],
            match_score=65,
            certifications=[
                dict(name="PMP – Project Management Professional", provider="PMI",
                     url="https://www.pmi.org/certifications/project-management-pmp"),
                dict(name="Professional Scrum Master (PSM I)", provider="Scrum.org",
                     url="https://www.scrum.org/assessments/professional-scrum-master-i-certification"),
                dict(name="Engineering Leadership Program", provider="Scaler",
                     url="https://www.scaler.com/courses/engineering-manager/"),
            ],
            hiring_companies=[
                dict(name="Atlassian"), dict(name="Notion"), dict(name="Stripe"),
                dict(name="Zepto"), dict(name="BrowserStack"), dict(name="Postman"),
            ],
        ),
    ],
    "security": [
        dict(
            title="Application Security Engineer",
            category="Cybersecurity",
            demand_level="High",
            avg_salary="₹20-45 LPA",
            description="India's cybersecurity market is growing at 15.6% CAGR. AppSec engineers who can shift-left security into DevOps pipelines (DevSecOps) are extremely scarce and highly paid.",
            tech_stack=["SAST / DAST tools", "Burp Suite", "OWASP Top 10", "Snyk / Semgrep", "AWS Security Hub", "Penetration Testing", "Zero Trust Architecture"],
            match_score=60,
            certifications=[
                dict(name="CEH – Certified Ethical Hacker", provider="EC-Council",
                     url="https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/"),
                dict(name="CompTIA Security+", provider="CompTIA",
                     url="https://www.comptia.org/certifications/security"),
                dict(name="OSCP – Offensive Security Certified Professional", provider="Offensive Security",
                     url="https://www.offsec.com/courses/pen-200/"),
            ],
            hiring_companies=[
                dict(name="Razorpay"), dict(name="HDFC Bank Tech"), dict(name="Paytm"),
                dict(name="Zscaler"), dict(name="Palo Alto Networks"), dict(name="Wipro CyberSec"),
            ],
        ),
    ],
}

def trending_jobs(content: ResumeContent) -> dict:
    """Return trending job roles matching the resume skills and experience."""
    skills_text  = " ".join(s.lower() for s in content.skills)
    title_text   = (content.contact.title or "").lower()
    bullets_text = " ".join(b.lower() for e in content.experience for b in e.bullets)
    all_text     = skills_text + " " + title_text + " " + bullets_text

    selected = []

    # Pick the most relevant categories
    if any(t in all_text for t in ["generative ai", "llm", "langchain", "gpt", "anthropic", "openai", "rag"]):
        selected += TRENDING_JOBS_DB["ai"]
    if any(t in all_text for t in ["python", "javascript", "react", "node", "java", "fastapi", "django", "backend", "frontend", "fullstack", "full-stack", "full stack"]):
        selected += TRENDING_JOBS_DB["software_engineer"]
    if any(t in all_text for t in ["data", "machine learning", "ml", "tensorflow", "pytorch", "pandas", "spark", "analytics"]):
        selected += TRENDING_JOBS_DB["data"]
    if any(t in all_text for t in ["devops", "kubernetes", "docker", "terraform", "ci/cd", "jenkins", "aws", "gcp", "azure", "cloud", "infrastructure"]):
        selected += TRENDING_JOBS_DB["devops"]
    if any(t in all_text for t in ["manager", "lead", "management", "team lead", "engineering manager", "scrum", "agile"]):
        selected += TRENDING_JOBS_DB["management"]
    if any(t in all_text for t in ["security", "cybersecurity", "penetration", "appsec", "devsecops"]):
        selected += TRENDING_JOBS_DB["security"]

    # Fallback — if nothing matched, show general top roles
    if not selected:
        selected = TRENDING_JOBS_DB["software_engineer"] + TRENDING_JOBS_DB["ai"]

    # Deduplicate and limit
    seen, unique = set(), []
    for j in selected:
        if j["title"] not in seen:
            seen.add(j["title"])
            unique.append(j)

    market_insight = (
        "India's tech hiring market in 2025-26 is characterised by two parallel trends: "
        "AI/ML roles are commanding 40-60% salary premiums over equivalent non-AI roles, while "
        "backend and platform engineering continue strong demand driven by India's 850M+ internet user growth. "
        "Roles that combine domain expertise with AI tool fluency are the fastest to fill and highest paid. "
        "Companies are increasingly bypassing traditional job boards — 65% of senior hires happen through LinkedIn "
        "and internal referrals. Building a strong GitHub profile and technical blog dramatically improves inbound recruiter interest."
    )

    if client.available():
        system = "You are a tech hiring market analyst with deep knowledge of India's tech ecosystem in 2026."
        prompt = (
            f"Resume skills: {skills_text[:300]}\n"
            f"Current title: {title_text}\n\n"
            "Based on this professional's background, list the top 4 trending job roles most relevant to them in India's 2026 tech market.\n"
            "For each role include: title, category, demand_level, avg_salary (INR), description (2-3 sentences on WHY it's trending), "
            "tech_stack (list of 6-8 technologies), match_score (0-100), "
            "certifications (list of 3, each with name+provider+url), "
            "hiring_companies (list of 6 company objects with name).\n"
            "Also include a market_insight string (2-3 sentences on overall India tech job market 2026).\n"
            'Return ONLY JSON: {"jobs": [...], "market_insight": "..."}'
        )
        try:
            return client.complete_json(prompt, system=system, max_tokens=2500)
        except Exception:
            pass

    return {"jobs": unique[:4], "market_insight": market_insight}
