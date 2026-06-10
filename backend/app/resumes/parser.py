"""Resume parsing: file bytes -> raw text -> normalized ResumeContent.

Two strategies:
  1. Heuristic parser (always available, no API key) — robust section detection
     by fuzzy header matching + regex for contact details and dates. Tuned to
     survive real-world resumes (varied headers, missing bullet characters,
     parenthesised dates, two-column PDF extraction, etc.).
  2. AI parser (app.ai.services.ai_parse) — even more robust on messy layouts;
     used automatically when an API key is configured.
"""
import io
import re
from typing import List, Optional, Tuple

import pdfplumber
from docx import Document

from app.schemas import (
    Contact,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ResumeContent,
)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\(?\+?\d[\d ()\.\-]{6,}\d)")
LINKEDIN_RE = re.compile(r"((?:https?://)?(?:www\.)?linkedin\.com/[\w\-/%]+)", re.I)
GITHUB_RE = re.compile(r"((?:https?://)?(?:www\.)?github\.com/[\w\-/%]+)", re.I)
URL_RE = re.compile(r"((?:https?://|www\.)[\w./\-?=&%#]+)", re.I)

# A single month-or-year token, e.g. "Jan 2020", "January 2020", "01/2020", "2020"
_DATE_TOKEN = r"(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}/\d{4}|\d{4})"
# A date range with various separators, optionally "present/current/now"
DATE_RANGE_RE = re.compile(
    rf"({_DATE_TOKEN})\s*(?:-|–|—|to|until|\u2013|\u2014)\s*({_DATE_TOKEN}|present|current|now|ongoing|date)",
    re.I,
)
SINGLE_DATE_RE = re.compile(rf"\b({_DATE_TOKEN})\b", re.I)

SECTION_ALIASES = {
    "summary": [
        "summary", "professional summary", "profile", "professional profile",
        "objective", "career objective", "about", "about me", "overview",
        "career summary", "executive summary", "personal statement", "bio",
        "objective statement", "profile summary", "career overview",
    ],
    "experience": [
        "experience", "work experience", "employment", "employment history",
        "professional experience", "work history", "career history",
        "relevant experience", "professional background", "work", "career",
        "experiences", "professional experiences", "volunteer experience",
        "experience details", "work details", "employment details",
        "job experience", "job history", "work detail",
        "internship", "internship details", "internship experience",
        "internships",
    ],
    "education": [
        "education", "academic background", "academics", "educational background",
        "education and training", "qualifications", "academic qualifications",
        "education & training", "education details", "academic details",
        "academic detail", "educational details", "educational qualification",
        "educational qualifications", "academic qualification",
        "academic record", "scholastics", "degree", "degrees",
    ],
    "skills": [
        "skills", "technical skills", "key skills",
        "skills and abilities", "technical proficiencies", "proficiencies",
        "tools and technologies", "core skills", "skill highlights",
        "technical expertise", "hard skills",
        "it skills", "software skills", "technical proficiency",
        "skill set", "skillset", "skill summary", "technology stack",
        "tech stack", "tools", "tools & technologies",
        "programming skills", "computer skills", "software proficiency",
    ],
    "core_competencies": [
        "core competencies", "competencies", "key competencies",
        "areas of expertise", "expertise", "strengths",
        "core competency", "functional competencies",
    ],
    "projects": [
        "projects", "personal projects", "key projects", "selected projects",
        "notable projects", "academic projects", "side projects", "portfolio",
        "project details", "project detail", "projects details",
        "major projects", "project work", "project experience",
    ],
    "certifications": [
        "certifications", "certification", "certificates", "certificate",
        "licenses", "licence", "licences",
        "licenses and certifications", "certifications and licenses",
        "professional certifications", "professional certification",
        "credentials", "credential",
        "licenses & certifications", "certifications & licenses",
        "awards and certifications", "awards & certifications",
        "training & certifications", "training & certification",
        "training and certifications", "training and certification",
        "training", "trainings",
        "certification details", "certificate details",
    ],
    "languages": [
        "languages", "language", "language skills", "language proficiency",
        "languages known", "known languages", "linguistic skills",
        "language proficiencies", "languages spoken",
    ],
    "accomplishments": [
        "accomplishments", "accomplishment", "achievements", "achievement",
        "awards", "award", "honors", "honour", "honours",
        "awards and honors", "awards & honors", "awards and achievements",
        "key accomplishments", "key achievements", "notable achievements",
        "recognition", "accolades",
    ],
    "activities": [
        "activities", "activity", "extracurricular activities",
        "extra curricular activities", "extra curricular",
        "extracurricular", "co curricular", "co curricular activities",
        "volunteer", "volunteering", "volunteer experience",
        "community involvement", "social activities",
    ],
    "references": [
        "references", "reference", "professional references",
    ],
    "contact_section": [
        "contact", "contact information", "contact details", "contact detail",
        "personal information", "personal details", "personal detail",
        "contact info", "personal info",
    ],
    "_other": [
        "publications", "publication", "interests", "interest",
        "hobbies", "hobby", "hobbies & interests", "hobbies and interests",
        "declaration", "declarations",
        "additional information", "additional details",
        "other details", "other information", "miscellaneous",
    ],
}

# Flatten for quick lookup, longest aliases first so multi-word wins.
_ALIAS_LOOKUP: List[Tuple[str, str]] = sorted(
    [(alias, key) for key, aliases in SECTION_ALIASES.items() for alias in aliases],
    key=lambda kv: -len(kv[0]),
)


# ---------- Text extraction ----------

def extract_text(file_bytes: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return _extract_pdf(file_bytes)
    if name.endswith(".docx"):
        return _extract_docx(file_bytes)
    if name.endswith(".doc"):
        raise ValueError("Legacy .doc not supported. Please upload .docx or .pdf.")
    # Fall back to sniffing: try PDF, then DOCX.
    try:
        return _extract_pdf(file_bytes)
    except Exception:
        try:
            return _extract_docx(file_bytes)
        except Exception:
            raise ValueError("Unsupported file type. Upload a .pdf or .docx file.")


def _extract_pdf(file_bytes: bytes) -> str:
    pages: List[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            # Layout-aware extraction keeps reading order saner on multi-column.
            text = page.extract_text(layout=False) or ""
            pages.append(text)
    return "\n".join(pages)


def _extract_docx(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    parts: List[str] = []
    for block in _iter_docx_blocks(doc):
        parts.append(block)
    return "\n".join(parts)


def _iter_docx_blocks(doc) -> List[str]:
    """Yield paragraph AND table text in true document order by walking the
    underlying XML body element, so table-based contact blocks appear at the
    top rather than being appended at the end."""
    from docx.table import Table
    from docx.text.paragraph import Paragraph as DocxParagraph
    out: List[str] = []
    body = doc.element.body
    for child in body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "p":
            p = DocxParagraph(child, doc)
            out.append(p.text)
        elif tag == "tbl":
            table = Table(child, doc)
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                # de-dupe merged cells
                seen = []
                for c in cells:
                    if c not in seen:
                        seen.append(c)
                if seen:
                    out.append("  ".join(seen))
    return out


# ---------- Header detection ----------

def _normalize_header(line: str) -> str:
    # Drop leading/trailing decorative characters and section numbering.
    s = line.strip()
    s = re.sub(r"^[\W_]+", "", s)        # leading bullets/numbers/symbols
    s = re.sub(r"[\W_]+$", "", s)        # trailing colons/underscores/rules
    return s.strip().lower()


def _stem_variants(word: str) -> List[str]:
    """Generate singular/plural variants for fuzzy header matching."""
    variants = [word]
    if word.endswith("s"):
        variants.append(word[:-1])                       # certifications -> certification
        if word.endswith("es"):
            variants.append(word[:-2])                   # licenses -> licens (won't match, but safe)
        if word.endswith("ies"):
            variants.append(word[:-3] + "y")             # activities -> activity
    else:
        variants.append(word + "s")                      # certification -> certifications
        variants.append(word + "es")                     # license -> licenses
    return variants


def _classify_header(line: str) -> Optional[str]:
    raw = line.strip()
    if not raw or len(raw) > 50:
        return None
    # Headers don't contain email addresses.
    if EMAIL_RE.search(raw) or "@" in raw:
        return None
    # Strip trailing period/comma/semicolon, but NOT colons (those are header signals).
    if raw.endswith((".", ",", ";")):
        return None

    cleaned = _normalize_header(line)
    if not cleaned or len(cleaned) > 45:
        return None

    # 1) Exact alias match.
    for alias, key in _ALIAS_LOOKUP:
        if cleaned == alias:
            return key

    # 2) Stemmed match: try singular/plural variants of each word.
    cleaned_words = cleaned.split()
    if len(cleaned_words) <= 5:
        # Build all stem combinations of the cleaned header
        stemmed_forms = set()
        stemmed_forms.add(cleaned)
        # Try stemming the last word (most common: "certifications" -> "certification")
        if cleaned_words:
            for variant in _stem_variants(cleaned_words[-1]):
                stemmed_forms.add(" ".join(cleaned_words[:-1] + [variant]))
            # Also try stemming the first word
            for variant in _stem_variants(cleaned_words[0]):
                stemmed_forms.add(" ".join([variant] + cleaned_words[1:]))

        for form in stemmed_forms:
            for alias, key in _ALIAS_LOOKUP:
                if form == alias:
                    return key

    # Guard: don't fuzzy-match "Label: value, value" content lines.
    has_label_colon = bool(re.search(r":\s*\S", raw))
    has_comma = "," in cleaned
    if has_label_colon or has_comma:
        return None

    # 3) Phrase containment: the alias appears as whole words in the header.
    #    Only for multi-word aliases OR when the header is very short (≤3 words),
    #    to avoid matching single words inside longer content lines.
    if len(cleaned_words) <= 6:
        for alias, key in _ALIAS_LOOKUP:
            alias_words = alias.split()
            # Multi-word alias appears as a contiguous phrase
            if len(alias_words) >= 2 and alias in cleaned:
                return key
            # Header starts with the alias words
            if cleaned_words[: len(alias_words)] == alias_words:
                return key
        # For very short headers (≤3 words), try whole-word match against
        # single-word aliases via stemmed forms.
        if len(cleaned_words) <= 3 and 'stemmed_forms' in dir():
            for form in stemmed_forms:
                for alias, key in _ALIAS_LOOKUP:
                    if form == alias:  # exact match only, not substring
                        return key
    return None


def _looks_like_header(line: str) -> bool:
    """Heuristic: a short ALL-CAPS line, Title-Case line, or a line ending with
    a colon is probably a section header even if we don't recognise it."""
    raw = line.strip()
    if not (0 < len(raw) <= 45):
        return False
    if EMAIL_RE.search(raw) or PHONE_RE.search(raw) or DATE_RANGE_RE.search(raw):
        return False
    # Trailing colon is a STRONG header signal (e.g. "Project Details:")
    if raw.endswith(":"):
        words = raw[:-1].split()
        return 1 <= len(words) <= 6
    if raw.endswith((".", ",", ";")):
        return False
    words = raw.split()
    if len(words) > 5:
        return False
    letters = [ch for ch in raw if ch.isalpha()]
    if not letters:
        return False
    upper_ratio = sum(ch.isupper() for ch in letters) / len(letters)
    return upper_ratio > 0.85  # mostly uppercase


# ---------- Contact ----------

def _parse_contact(lines: List[str]) -> Contact:
    head = "\n".join(lines[:20])  # Wider scan for table-appended contact info
    contact = Contact()

    # ---- Extract labeled fields first (e.g. "Email: x", "Phone: x", "Location: x")
    # These are very common in Indian resumes (Naukri, etc.)
    LABEL_PATTERNS = [
        (r"(?:e-?mail|email\s*(?:id|address)?)\s*[:\-]\s*(.+)", "email"),
        (r"(?:phone|mobile|cell|tel|contact\s*(?:no|number)?)\s*[:\-]\s*(.+)", "phone"),
        (r"(?:location|address|city|place)\s*[:\-]\s*(.+)", "location"),
        (r"(?:linkedin)\s*[:\-]\s*(.+)", "linkedin"),
        (r"(?:website|portfolio|blog|url)\s*[:\-]\s*(.+)", "website"),
        (r"(?:github)\s*[:\-]\s*(.+)", "github"),
    ]
    for line in lines[:20]:
        stripped = line.strip()
        for pattern, field in LABEL_PATTERNS:
            m = re.match(pattern, stripped, re.I)
            if m:
                val = m.group(1).strip().rstrip(",;|")
                if field == "email" and not contact.email:
                    contact.email = val
                elif field == "phone" and not contact.phone:
                    contact.phone = val
                elif field == "location" and not contact.location:
                    contact.location = val
                elif field == "linkedin" and not contact.linkedin:
                    contact.linkedin = val
                elif field == "website" and not contact.website:
                    contact.website = val
                elif field == "github" and not contact.website:
                    contact.website = val
                break

    # ---- Regex extraction from the full header block (catches inline tokens)
    if not contact.email:
        if m := EMAIL_RE.search(head):
            contact.email = m.group(0)
    if not contact.linkedin:
        if m := LINKEDIN_RE.search(head):
            contact.linkedin = m.group(1)
    if not contact.phone:
        if m := PHONE_RE.search(head):
            cand = m.group(0).strip()
            digits = re.sub(r"\D", "", cand)
            if 7 <= len(digits) <= 15:
                contact.phone = cand
    # website (first non-linkedin, non-github url)
    if not contact.website:
        for m in URL_RE.finditer(head):
            u = m.group(1)
            if "linkedin.com" not in u.lower():
                contact.website = u
                break

    non_empty = [l.strip() for l in lines[:12] if l.strip()]

    def has_contact_token(l: str) -> bool:
        return bool(EMAIL_RE.search(l) or PHONE_RE.search(l) or URL_RE.search(l))

    def is_label_line(l: str) -> bool:
        """Lines like 'Email: x' or 'Phone: x' are labeled contact, not name/title."""
        return bool(re.match(r"(?:e-?mail|phone|mobile|cell|tel|location|address|linkedin|github|website|portfolio|contact)\s*[:\-]", l, re.I))

    # A separator-delimited contact line, e.g. "Title | email | phone | city"
    # or "Name — Title". Splits on pipes, bullets, spaced dashes, big gaps.
    def split_delims(l: str) -> List[str]:
        return [p.strip() for p in re.split(r"\s*[|•·]\s*|\s+[–—-]\s+|\s{3,}", l) if p.strip()]

    LOC_RE = re.compile(
        r"^([A-Z][\w.\-]+(?:\s[A-Z][\w.\-]+)*,\s*[A-Z]{2}|"          # City, ST
        r"[A-Z][\w.\-]+(?:\s[A-Z][\w.\-]+)*,\s*[A-Z][a-zA-Z]+)$"     # City, Country
    )

    def looks_like_location(s: str) -> bool:
        return bool(LOC_RE.match(s.strip()))

    # ---- Name: the resume's name is almost always the first non-empty line.
    name_idx = None
    for i, l in enumerate(non_empty[:4]):
        if is_label_line(l):
            continue
        bare = l.split("|")[0].strip()
        if has_contact_token(l) and not bare:
            continue
        if _classify_header(l):           # a real section header, not a name
            continue
        # Take the part before any delimiter as the candidate name.
        cand = split_delims(l)[0] if split_delims(l) else l
        if has_contact_token(cand):
            continue
        if 1 <= len(cand.split()) <= 6:
            contact.name = cand.strip(" ,")
            name_idx = i
            # If the name line also carries delimiters, mine it for title/loc.
            for seg in split_delims(l)[1:]:
                if has_contact_token(seg):
                    continue
                if looks_like_location(seg) and not contact.location:
                    contact.location = seg
                elif not contact.title:
                    contact.title = seg
            break

    # ---- Title & location from the lines following the name.
    if name_idx is not None:
        for l in non_empty[name_idx + 1:name_idx + 5]:
            if is_label_line(l):
                continue
            for seg in split_delims(l):
                if has_contact_token(seg):
                    continue
                if looks_like_location(seg):
                    if not contact.location:
                        contact.location = seg
                elif not contact.title and len(seg.split()) <= 8 and not _classify_header(seg):
                    contact.title = seg

    # ---- Location fallback: scan the header for a City, ST / City, Country
    # pattern, but never let it capture a slice of the name.
    if not contact.location:
        for l in non_empty:
            if l == contact.name:
                continue
            # Try the full line first (for bare location lines)
            cleaned = l.strip()
            if looks_like_location(cleaned):
                contact.location = cleaned
                break
            # Try within delimiters
            inner = re.search(r"(?:^|[|•·]\s*)([A-Z][\w.\-]+(?:\s[A-Z][\w.\-]+)*,\s*[A-Z]{2,})\b", l)
            if inner and inner.group(1) != contact.name:
                contact.location = inner.group(1).strip()
                break
    return contact


# ---------- Section splitting ----------

def _split_sections(text: str):
    lines = text.splitlines()
    sections = {"_contact": []}
    current = "_contact"
    prev_content = "_contact"  # last non-contact/non-other section

    # Sections where content entries can be short uppercase text (e.g. "AWS SA",
    # "PMP", "Star Performer Award") — don't break these with false header detection.
    _LIST_SECTIONS = {"certifications", "accomplishments", "activities", "languages",
                      "skills", "core_competencies"}

    for line in lines:
        key = _classify_header(line)
        if key is None and current != "_contact" and _looks_like_header(line):
            # Don't treat as a boundary if we're in a list-type section
            if current not in _LIST_SECTIONS:
                cur_lines = sections.get(current, [])
                has_content = any(l.strip() for l in cur_lines)
                if has_content:
                    key = "_other"

        if key:
            if key not in ("contact_section", "_other"):
                prev_content = key
            current = key
            sections.setdefault(current, [])
            continue

        # If we're inside a contact_section and this line is NOT contact data,
        # it belongs to the previous content section (e.g. a second Experience
        # entry that appears after a Contact block).
        if current == "contact_section":
            stripped = line.strip()
            if stripped and not _is_contact_data_line(stripped):
                # Check if it looks like a role header (has a date) or section content
                if DATE_RANGE_RE.search(stripped) or _BULLET_RE.match(stripped):
                    sections.setdefault(prev_content, []).append(line)
                    current = prev_content
                    continue

        sections.setdefault(current, []).append(line)
    return lines, sections


# ---------- Date helpers ----------

def _extract_dates(line: str):
    """Return (start, end, line_without_dates)."""
    m = DATE_RANGE_RE.search(line)
    if m:
        start, end = m.group(1).strip(), m.group(2).strip()
        cleaned = (line[: m.start()] + " " + line[m.end():])
        cleaned = re.sub(r"[\(\)\[\]]", " ", cleaned)
        cleaned = cleaned.strip(" |,–—-\t")
        return start, end, re.sub(r"\s{2,}", " ", cleaned).strip()
    # single date (e.g. graduation year)
    m = SINGLE_DATE_RE.search(line)
    if m:
        d = m.group(1).strip()
        cleaned = (line[: m.start()] + " " + line[m.end():])
        cleaned = re.sub(r"[\(\)\[\]]", " ", cleaned)
        cleaned = cleaned.strip(" |,–—-\t")
        return d, "", re.sub(r"\s{2,}", " ", cleaned).strip()
    return "", "", line.strip()


def _split_title_company(text: str) -> Tuple[str, str]:
    """Split 'Title at Company' / 'Title, Company' / 'Title | Company' /
    'Title — Company'. Handles separators with or without surrounding spaces."""
    text = text.strip(" |,–—-\t")
    if not text:
        return "", ""
    # "X at Y" / "X @ Y"
    m = re.split(r"\s+(?:at|@)\s+", text, maxsplit=1, flags=re.I)
    if len(m) == 2:
        return m[0].strip(), m[1].strip()
    # pipe / bullet / en-dash / em-dash (spaces optional)
    m = re.split(r"\s*[|•·–—]\s*", text, maxsplit=1)
    if len(m) == 2 and m[0].strip() and m[1].strip():
        return m[0].strip(), m[1].strip()
    # comma (spaces optional) — only split once
    m = re.split(r"\s*,\s*", text, maxsplit=1)
    if len(m) == 2 and m[0].strip() and m[1].strip():
        return m[0].strip(), m[1].strip()
    # hyphen with surrounding spaces
    m = re.split(r"\s+-\s+", text, maxsplit=1)
    if len(m) == 2:
        return m[0].strip(), m[1].strip()
    return text, ""


_BULLET_RE = re.compile(r"^\s*[•\-\*\u2022\u2023\u25E6\u2043\u2219·▪◦‣]\s*")


def _is_role_header(line: str) -> bool:
    """A line that introduces a new role: contains a date range, or looks like
    'Title at/—/| Company' without being a bullet."""
    if _BULLET_RE.match(line):
        return False
    if DATE_RANGE_RE.search(line):
        return True
    # Title<sep>Company pattern with a known separator
    if re.search(r"\s+(?:at|@)\s+", line, re.I) or re.search(r"\s[|•·–—]\s", line):
        # avoid treating a sentence as a header
        return len(line.split()) <= 12
    return False


# ---------- Experience ----------

def _parse_experience(block: List[str]) -> List[ExperienceItem]:
    items: List[ExperienceItem] = []
    current: Optional[ExperienceItem] = None
    pending_company_line = True  # whether the next plain line could be company/location

    for raw in block:
        line = raw.strip()
        if not line:
            continue
        if _BULLET_RE.match(line):
            if current is None:
                current = ExperienceItem()
            current.bullets.append(_BULLET_RE.sub("", line).strip())
            pending_company_line = False
            continue

        if _is_role_header(line) or current is None:
            if current is not None:
                items.append(current)
            current = ExperienceItem()
            start, end, rest = _extract_dates(line)
            current.start, current.end = start, end
            title, company = _split_title_company(rest)
            current.title, current.company = title, company
            pending_company_line = not bool(company)
            continue

        # Plain line inside a role.
        if current is not None:
            if pending_company_line and not current.company:
                # Could be "Company, Location" or just the company / location.
                start, end, rest = _extract_dates(line)
                if start and not current.start:
                    current.start, current.end = start, end
                comp, loc = _split_title_company(rest) if rest else ("", "")
                if comp:
                    current.company = comp
                    if loc:
                        current.location = loc
                elif rest:
                    current.company = rest
                pending_company_line = False
            else:
                current.bullets.append(line)
    if current is not None:
        items.append(current)
    # Drop empties.
    return [e for e in items if (e.title or e.company or e.bullets)]


# ---------- Education ----------

def _parse_education(block: List[str]) -> List[EducationItem]:
    items: List[EducationItem] = []
    current: Optional[EducationItem] = None
    for raw in block:
        line = raw.strip()
        if not line:
            continue
        if _BULLET_RE.match(line):
            if current:
                extra = _BULLET_RE.sub("", line).strip()
                current.details = (current.details + " " + extra).strip() if current.details else extra
            continue
        start, end, rest = _extract_dates(line)
        # Heuristic: a line mentioning a degree/school starts a new entry.
        looks_like_entry = bool(
            re.search(r"\b(b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|mba|ph\.?d|bachelor|master|associate|diploma|degree|university|college|institute|school)\b", line, re.I)
        )
        if current is None or looks_like_entry or start:
            if current is not None:
                items.append(current)
            current = EducationItem()
            current.start, current.end = start, end
            degree, school = _split_title_company(rest)
            current.degree, current.school = degree, school
        else:
            current.details = (current.details + " " + rest).strip() if current.details else rest
    if current is not None:
        items.append(current)
    return [e for e in items if (e.degree or e.school or e.details)]


# ---------- Skills ----------

def _parse_skills(block: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in block:
        line = _BULLET_RE.sub("", raw.strip()).strip()
        if not line:
            continue
        # Drop a leading "Category:" label, keep the values after it.
        if ":" in line and len(line.split(":")[0].split()) <= 4:
            line = line.split(":", 1)[1]
        for piece in re.split(r"[,;•|/\u2022·]|\s{3,}", line):
            s = piece.strip(" -·.\t")
            if 1 < len(s) < 40 and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
    return out[:50]


# ---------- Projects ----------

# Common action verbs that start experience/project bullets
_ACTION_VERBS = set(
    "designed built developed implemented created managed led achieved "
    "reduced increased improved launched delivered optimized maintained "
    "integrated deployed automated configured established coordinated "
    "facilitated enhanced migrated resolved streamlined contributed "
    "analyzed architected conducted developed engineered executed "
    "generated handled identified mentored negotiated orchestrated "
    "performed planned produced published refactored reviewed scaled "
    "secured spearheaded supervised supported trained transformed "
    "utilized processed collaborated drove handled oversaw pioneered "
    "presented proposed tested upgraded worked wrote".split()
)


def _parse_projects(block: List[str]) -> List[ProjectItem]:
    items: List[ProjectItem] = []
    current: Optional[ProjectItem] = None
    prev_blank = False  # track blank lines as paragraph breaks

    for raw in block:
        line = raw.strip()
        if not line:
            prev_blank = True
            continue

        # Bullet-prefixed lines are always bullets
        if _BULLET_RE.match(line):
            if current is None:
                current = ProjectItem(name="Project")
            current.bullets.append(_BULLET_RE.sub("", line).strip())
            prev_blank = False
            continue

        # Determine if this line starts a new project or is a bullet
        has_separator = bool(re.search(r"\s[-–—:]\s", line))
        first_word = line.split()[0].lower().rstrip(".,;:") if line.split() else ""
        starts_with_verb = first_word in _ACTION_VERBS
        word_count = len(line.split())

        # A line is a NEW PROJECT NAME if:
        # - It has a title-description separator ("Name - Description")
        # - OR it's the first entry (no current project)
        # - OR there was a blank line before it AND it's short (≤3 words)
        #   AND it doesn't start with an action verb
        is_new_project = (
            has_separator
            or not current
            or (prev_blank and word_count <= 3 and not starts_with_verb)
        )

        if is_new_project:
            if current is not None:
                items.append(current)
            name, desc = _split_title_company(line)
            current = ProjectItem(name=name or line, description=desc)
        else:
            # Treat as a bullet of the current project
            if current is None:
                current = ProjectItem(name="Project")
            current.bullets.append(line)

        prev_blank = False

    if current is not None:
        items.append(current)
    return [p for p in items if (p.name or p.bullets or p.description)]


# ---------- Top-level ----------

def _is_contact_data_line(stripped: str) -> bool:
    """Return True if a line is clearly contact information (email, phone,
    address, URL) rather than resume content. Used to filter orphaned contact
    data that ends up in other sections."""
    if not stripped:
        return False

    # Labeled contact field: "Email: x", "Phone: x", etc.
    if re.match(r"(?:e-?mail|phone|mobile|cell|tel|location|address|linkedin|github|website|portfolio|contact\s*no)\s*[:\-]", stripped, re.I):
        return True

    # Line is PRIMARILY contact tokens (email, phone, URL) with minor text
    has_email = bool(EMAIL_RE.search(stripped))
    has_phone = bool(PHONE_RE.search(stripped) and len(re.sub(r"\D", "", stripped)) >= 7)
    has_linkedin = bool(LINKEDIN_RE.search(stripped))
    has_url = bool(URL_RE.search(stripped))

    # Count how many contact tokens this line has
    contact_signals = sum([has_email, has_phone, has_linkedin, has_url])

    # If 2+ contact signals, it's definitely a contact line (e.g. "email | phone | city")
    if contact_signals >= 2:
        return True

    # Pipe/bullet-delimited line with at least one contact signal
    # (common format: "Name | email | phone | city")
    if contact_signals >= 1 and re.search(r"\s*[|•·]\s*", stripped):
        segments = re.split(r"\s*[|•·]\s*", stripped)
        if len(segments) >= 3:
            return True

    # Pure email line (nothing else meaningful)
    if has_email:
        no_email = EMAIL_RE.sub("", stripped).strip(" |•·,\t-")
        if not no_email or len(no_email.split()) <= 2:
            return True

    # Pure phone line (short line dominated by a phone number)
    if has_phone and len(stripped.split()) <= 4:
        return True

    # URL line — match linkedin.com/... and github.com/... even without http/www
    if has_linkedin or has_url:
        no_url = URL_RE.sub("", LINKEDIN_RE.sub("", stripped)).strip(" |•·,\t-")
        if not no_url or len(no_url.split()) <= 1:
            return True
    # Bare domain URLs: "linkedin.com/in/name", "github.com/name"
    if re.match(r"^(?:linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|behance\.net|dribbble\.com|medium\.com)/", stripped, re.I):
        return True

    # Street address pattern (number + road/street/lane/nagar etc.)
    if re.match(r"^\d+[\w\s,./\-]+(?:road|street|lane|nagar|colony|sector|block|floor|apartment|apt|suite|bldg|building|avenue|ave|blvd|drive|dr|plot|flat)\b", stripped, re.I):
        return True

    # Location: "City, State" / "City, Country" / "City, State, Country" as a bare line
    # Must NOT look like "Title, Company" or a language list.
    _COMMON_LANGS = {"english","hindi","tamil","telugu","kannada","malayalam","bengali",
                     "marathi","gujarati","punjabi","urdu","french","german","spanish",
                     "italian","japanese","chinese","korean","arabic","portuguese",
                     "russian","dutch","swedish","mandarin","turkish","thai","polish",
                     "czech","greek","hebrew","vietnamese","indonesian","malay"}
    _TECH_TERMS = {"python","java","javascript","typescript","react","angular","vue",
                   "node","nodejs","docker","kubernetes","aws","azure","gcp","mongodb",
                   "postgresql","mysql","redis","kafka","tensorflow","pytorch","spark",
                   "hadoop","jenkins","git","linux","flutter","swift","kotlin","golang",
                   "rust","scala","ruby","rails","django","flask","spring","graphql",
                   "elasticsearch","terraform","ansible","nginx","apache","figma","sketch"}
    if re.match(r"^[A-Z][\w.\s\-]+(?:,\s*[A-Z][\w.\s\-]+){1,3}$", stripped) and len(stripped.split()) <= 6:
        if not re.search(r"\b(?:engineer|developer|manager|analyst|designer|consultant|architect|lead|senior|junior|director|head|officer|intern|associate|specialist)\b", stripped, re.I):
            parts = [p.strip() for p in stripped.split(",")]
            # Skip if any part is a common language name
            if any(p.strip().lower() in _COMMON_LANGS or p.strip().lower() in _TECH_TERMS for p in parts):
                return False
            if len(parts) >= 2 and all(1 <= len(p.split()) <= 3 for p in parts):
                return True

    return False


# ---------- Top-level ----------

def heuristic_parse(text: str) -> ResumeContent:
    lines, sections = _split_sections(text)
    content = ResumeContent()

    # Merge any explicit "Contact" section into the implicit contact block.
    contact_lines = list(sections.get("_contact", lines[:12]))
    if sections.get("contact_section"):
        contact_lines.extend(sections["contact_section"])

    # ---- Pre-processing: strip orphaned contact lines from non-contact sections.
    # Some resumes place email/phone/address between or after other sections.
    # Pull those lines into the contact block BEFORE parsing anything.
    for sec_key in list(sections.keys()):
        if sec_key in ("_contact", "contact_section", "_other", "languages",
                       "skills", "certifications", "accomplishments", "activities",
                       "core_competencies"):
            continue
        cleaned_body = []
        for line in sections[sec_key]:
            stripped = line.strip()
            if _is_contact_data_line(stripped):
                contact_lines.append(line)
            else:
                cleaned_body.append(line)
        sections[sec_key] = cleaned_body

    content.contact = _parse_contact(contact_lines)

    if sections.get("summary"):
        content.summary = " ".join(l.strip() for l in sections["summary"] if l.strip()).strip()
    elif sections.get("_contact"):
        # Some resumes put an unlabeled summary paragraph under the header.
        tail = [l.strip() for l in sections["_contact"][1:] if l.strip()]
        # find a long-ish prose line that isn't contact info
        for l in tail:
            if len(l.split()) >= 12 and not EMAIL_RE.search(l) and not URL_RE.search(l):
                content.summary = l
                break

    if sections.get("experience"):
        content.experience = _parse_experience(sections["experience"])
    if sections.get("education"):
        content.education = _parse_education(sections["education"])
    if sections.get("skills"):
        content.skills = _parse_skills(sections["skills"])
    if sections.get("projects"):
        content.projects = _parse_projects(sections["projects"])
    if sections.get("certifications"):
        content.certifications = [
            _BULLET_RE.sub("", l.strip()).strip()
            for l in sections["certifications"] if l.strip()
        ]
    if sections.get("languages"):
        content.languages = _parse_simple_list(sections["languages"])
    if sections.get("accomplishments"):
        content.accomplishments = [
            _BULLET_RE.sub("", l.strip()).strip()
            for l in sections["accomplishments"] if l.strip()
        ]
    if sections.get("core_competencies"):
        content.core_competencies = _parse_simple_list(sections["core_competencies"])
    if sections.get("activities"):
        content.activities = [
            _BULLET_RE.sub("", l.strip()).strip()
            for l in sections["activities"] if l.strip()
        ]
    if sections.get("references"):
        content.references = _parse_references(sections["references"])

    # ---- Post-processing: rescue orphaned contact info from any section ----
    # Some resumes place contact info between or after other sections. Scan all
    # parsed data and pull contact tokens back into the contact object.
    _rescue_orphaned_contact(content)

    return content


def _rescue_orphaned_contact(content: ResumeContent):
    """Scan all sections for lines that are actually contact info (email,
    phone, URL, address) and move them to the contact object. This handles
    resumes where contact info appears mid-document, after projects, etc."""

    def is_contact_line(line: str) -> bool:
        """A line that is purely contact info (not a meaningful bullet)."""
        stripped = line.strip()
        if not stripped:
            return False
        # Labeled contact line: "Email: x", "Phone: x"
        if re.match(r"(?:e-?mail|phone|mobile|cell|tel|location|address|linkedin|github|website|portfolio)\s*[:\-]", stripped, re.I):
            return True
        # Pure email line
        if EMAIL_RE.fullmatch(stripped):
            return True
        # Pure phone line (most of the line is the phone number)
        m = PHONE_RE.search(stripped)
        if m and len(m.group(0)) > len(stripped) * 0.5:
            return True
        # Pure URL line
        if URL_RE.fullmatch(stripped):
            return True
        return False

    def extract_from_line(line: str):
        """Extract contact tokens from a line into the contact object."""
        if not content.contact.email:
            m = EMAIL_RE.search(line)
            if m:
                content.contact.email = m.group(0)
        if not content.contact.phone:
            m = PHONE_RE.search(line)
            if m:
                cand = m.group(1).strip()
                digits = re.sub(r"\D", "", cand)
                if 7 <= len(digits) <= 15:
                    content.contact.phone = cand
        if not content.contact.linkedin:
            m = LINKEDIN_RE.search(line)
            if m:
                content.contact.linkedin = m.group(1)
        if not content.contact.website:
            for m in URL_RE.finditer(line):
                u = m.group(1)
                if "linkedin.com" not in u.lower():
                    content.contact.website = u
                    break
        # Labeled location/address
        loc_m = re.match(r"(?:location|address|city|place)\s*[:\-]\s*(.+)", line.strip(), re.I)
        if loc_m and not content.contact.location:
            content.contact.location = loc_m.group(1).strip().rstrip(",;|")

    # Clean project bullets
    for proj in content.projects:
        clean_bullets = []
        for b in proj.bullets:
            if is_contact_line(b):
                extract_from_line(b)
            else:
                clean_bullets.append(b)
        proj.bullets = clean_bullets

    # Clean experience bullets
    for exp in content.experience:
        clean_bullets = []
        for b in exp.bullets:
            if is_contact_line(b):
                extract_from_line(b)
            else:
                clean_bullets.append(b)
        exp.bullets = clean_bullets

    # Clean certifications (shouldn't contain contact info, but just in case)
    clean_certs = []
    for c in content.certifications:
        if is_contact_line(c):
            extract_from_line(c)
        else:
            clean_certs.append(c)
    content.certifications = clean_certs

    # Clean accomplishments
    clean_acc = []
    for a in content.accomplishments:
        if is_contact_line(a):
            extract_from_line(a)
        else:
            clean_acc.append(a)
    content.accomplishments = clean_acc

    # Clean projects — remove entire entries whose NAME is contact info
    clean_projects = []
    for proj in content.projects:
        if is_contact_line(proj.name):
            extract_from_line(proj.name)
        else:
            clean_projects.append(proj)
    content.projects = clean_projects


def _parse_simple_list(block: List[str]) -> List[str]:
    """Parse a section that is a simple comma/bullet-separated list of items."""
    out: List[str] = []
    seen = set()
    for raw in block:
        line = _BULLET_RE.sub("", raw.strip()).strip()
        if not line:
            continue
        # "Label: values" pattern
        if ":" in line and len(line.split(":")[0].split()) <= 4:
            line = line.split(":", 1)[1]
        for piece in re.split(r"[,;•|/\u2022·]", line):
            s = piece.strip(" -·.\t")
            if 1 < len(s) < 60 and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
    return out


def _parse_references(block: List[str]):
    """Parse reference entries: Name, Title, Company, Contact."""
    from app.schemas import ReferenceItem
    items: List[ReferenceItem] = []
    current = None
    for raw in block:
        line = _BULLET_RE.sub("", raw.strip()).strip()
        if not line:
            continue
        # A line with email or phone is contact info for the current reference
        if current and (EMAIL_RE.search(line) or PHONE_RE.search(line)):
            current.contact = line
            continue
        # A new reference entry — try "Name, Title at Company" or just a name
        if current is not None:
            items.append(current)
        parts = re.split(r"\s*[,|–—]\s*", line)
        ref = ReferenceItem(name=parts[0])
        if len(parts) >= 2:
            ref.title = parts[1]
        if len(parts) >= 3:
            ref.company = parts[2]
        current = ref
    if current is not None:
        items.append(current)
    return items
