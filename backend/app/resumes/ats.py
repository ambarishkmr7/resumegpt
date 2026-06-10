"""Deterministic, explainable ATS scorer.

Total = 100 points across weighted categories. Returns a breakdown plus
specific, actionable issues so the UI can tell the user exactly what to fix
to push toward 100%.
"""
import re
from typing import List, Optional

from app.schemas import ATSIssue, ATSResult, ResumeContent

ACTION_VERBS = {
    "led", "built", "designed", "developed", "implemented", "launched", "created",
    "managed", "improved", "increased", "reduced", "optimized", "automated",
    "delivered", "drove", "spearheaded", "architected", "migrated", "scaled",
    "shipped", "owned", "established", "negotiated", "mentored", "analyzed",
    "engineered", "deployed", "streamlined", "generated", "achieved",
}
WEAK_PHRASES = ["responsible for", "duties included", "worked on", "helped with", "tasked with"]
QUANT_RE = re.compile(r"(\d+%?|\$\d+|\b\d{2,}\b)")
STOPWORDS = set(
    (
        # articles, conjunctions, prepositions, pronouns, aux verbs
        "a an the and or for to of in on with at by from as is are be this that your you our we will "
        "it its their they them his her have has had was were been being do does did but not can could "
        "would should may might must into out over under than then them these those who whom which what "
        # generic job-description filler that should never count as a skill keyword
        "looking seeking seek candidate candidates experience experienced year years ability able strong "
        "required require requirements preferred plus work working role roles team teams join company "
        "responsibilities responsible opportunity opportunities knowledge skill skills proficient proficiency "
        "excellent good great help support including etc using use used new well across within about "
        "ideal must-have nice such more most other others per via etc. you'll we're our you're position "
        "applicant applicants hire hiring looking-for day-to-day"
    ).split()
)


def _first_word(s: str) -> str:
    s = re.sub(r"^[^A-Za-z]+", "", s)
    return s.split()[0].lower() if s.split() else ""


def _extract_keywords(text: str, top: int = 30) -> List[str]:
    words = re.findall(r"[A-Za-z][A-Za-z+#.\-]*", text.lower())
    freq: dict[str, int] = {}
    for w in words:
        w = w.strip(".-")
        if w in STOPWORDS or len(w) < 3:
            continue
        freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])][:top]


def _resume_text(c: ResumeContent) -> str:
    parts = [c.summary, " ".join(c.skills)]
    for e in c.experience:
        parts += [e.title, e.company, *e.bullets]
    for p in c.projects:
        parts += [p.name, p.description, *p.bullets]
    parts += c.certifications
    return " ".join(parts).lower()


def score_resume(content: ResumeContent, job_description: Optional[str] = None) -> ATSResult:
    issues: List[ATSIssue] = []
    breakdown: dict[str, int] = {}

    # 1) Contact completeness — 15 pts
    c = content.contact
    contact_pts, contact_max = 0, 15
    fields = {"email": c.email, "phone": c.phone, "location": c.location,
              "name": c.name, "linkedin": c.linkedin}
    weights = {"name": 4, "email": 4, "phone": 3, "location": 2, "linkedin": 2}
    for f, val in fields.items():
        if val.strip():
            contact_pts += weights[f]
        else:
            sev = "critical" if f in ("email", "name") else "warning"
            issues.append(ATSIssue(
                category="Contact", severity=sev,
                message=f"Missing {f}.",
                suggestion=f"Add your {f} so recruiters and ATS parsers can identify and reach you.",
            ))
    breakdown["Contact"] = contact_pts

    # 2) Professional summary — 10 pts
    summ_pts = 0
    wc = len(content.summary.split())
    if wc >= 30:
        summ_pts = 10
    elif wc >= 15:
        summ_pts = 6
        issues.append(ATSIssue(category="Summary", severity="warning",
            message="Summary is short.",
            suggestion="Expand your summary to 30–60 words covering role, years of experience, and 1–2 standout achievements."))
    else:
        issues.append(ATSIssue(category="Summary", severity="critical",
            message="No professional summary.",
            suggestion="Add a 30–60 word summary at the top. ATS and recruiters read it first."))
    breakdown["Summary"] = summ_pts

    # 3) Experience depth & impact — 35 pts
    exp_pts, exp_max = 0, 35
    all_bullets = [b for e in content.experience for b in e.bullets]
    if content.experience:
        exp_pts += 8  # has experience
        # quantified bullets
        quantified = sum(1 for b in all_bullets if QUANT_RE.search(b))
        if all_bullets:
            ratio = quantified / len(all_bullets)
            exp_pts += int(round(12 * min(ratio / 0.5, 1)))  # full at >=50% quantified
            if ratio < 0.5:
                issues.append(ATSIssue(category="Impact", severity="warning",
                    message=f"Only {quantified}/{len(all_bullets)} bullets contain metrics.",
                    suggestion="Quantify at least half your bullets (%, $, time saved, scale). 'Reduced API latency 40%' beats 'Improved performance'."))
        # action verbs
        strong = sum(1 for b in all_bullets if _first_word(b) in ACTION_VERBS)
        if all_bullets:
            vratio = strong / len(all_bullets)
            exp_pts += int(round(8 * vratio))
            if vratio < 0.7:
                issues.append(ATSIssue(category="Impact", severity="warning",
                    message="Many bullets don't start with a strong action verb.",
                    suggestion="Begin each bullet with a verb like Led, Built, Reduced, Launched."))
        # weak phrases
        weak_hits = [p for p in WEAK_PHRASES if p in _resume_text(content)]
        if weak_hits:
            issues.append(ATSIssue(category="Impact", severity="warning",
                message=f"Weak phrasing detected: {', '.join(weak_hits)}.",
                suggestion="Replace passive phrases like 'responsible for' with active accomplishments."))
        else:
            exp_pts += 4
        # enough bullets per role
        if all_bullets and len(all_bullets) >= 2 * len(content.experience):
            exp_pts += 3
        else:
            issues.append(ATSIssue(category="Impact", severity="info",
                message="Some roles have few bullet points.",
                suggestion="Aim for 3–5 bullets per recent role."))
    else:
        issues.append(ATSIssue(category="Experience", severity="critical",
            message="No work experience listed.",
            suggestion="Add at least one role with 3–5 achievement-focused bullet points."))
    breakdown["Experience"] = min(exp_pts, exp_max)

    # 4) Skills — 12 pts
    skills_pts = 0
    n = len(content.skills)
    if n >= 8:
        skills_pts = 12
    elif n >= 4:
        skills_pts = 8
        issues.append(ATSIssue(category="Skills", severity="info",
            message="Few skills listed.",
            suggestion="List 8–15 relevant hard skills/technologies for better keyword matching."))
    else:
        issues.append(ATSIssue(category="Skills", severity="warning",
            message="Skills section is sparse or missing.",
            suggestion="Add a dedicated Skills section with the technologies/tools the job requires."))
    breakdown["Skills"] = skills_pts

    # 5) Education — 6 pts
    edu_pts = 6 if content.education else 0
    if not content.education:
        issues.append(ATSIssue(category="Education", severity="info",
            message="No education listed.",
            suggestion="Add your highest degree (or relevant bootcamp/certification)."))
    breakdown["Education"] = edu_pts

    # 6) Formatting / parse-safety — 10 pts
    fmt_pts = 10
    if len(all_bullets) > 0 and any(len(b.split()) > 45 for b in all_bullets):
        fmt_pts -= 3
        issues.append(ATSIssue(category="Formatting", severity="info",
            message="Some bullets are very long.",
            suggestion="Keep bullets under ~2 lines (≈30 words) so they scan cleanly."))
    breakdown["Formatting"] = max(fmt_pts, 0)

    # 7) Keyword match vs job description — 12 pts (only if JD provided)
    matched, missing = [], []
    if job_description:
        jd_keywords = _extract_keywords(job_description, top=25)
        rtext = _resume_text(content)
        matched = [k for k in jd_keywords if k in rtext]
        missing = [k for k in jd_keywords if k not in rtext]
        kw_pts = int(round(12 * (len(matched) / len(jd_keywords)))) if jd_keywords else 0
        breakdown["Keywords"] = kw_pts
        if missing:
            issues.append(ATSIssue(category="Keywords", severity="warning",
                message=f"Missing {len(missing)} keywords from the job description.",
                suggestion="Naturally weave in relevant terms: " + ", ".join(missing[:10]) + "."))
    else:
        # redistribute the 12 keyword points proportionally so a no-JD resume
        # can still reach 100 on its own merits.
        scale = 100 / 88
        for k in list(breakdown.keys()):
            breakdown[k] = round(breakdown[k] * scale)

    total = min(sum(breakdown.values()), 100)
    _order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: _order.get(i.severity, 3))
    return ATSResult(
        score=total,
        breakdown=breakdown,
        issues=issues,
        matched_keywords=matched,
        missing_keywords=missing,
    )
