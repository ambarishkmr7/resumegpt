"""LinkedIn job search scraping tools — plain Python, no MCP dependency.

Ported from the linkedin-mcp-search TypeScript project.
Uses httpx + BeautifulSoup to scrape LinkedIn's public (guest-access) job pages.
No LinkedIn API key required.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

LINKEDIN_BASE = "https://www.linkedin.com"
JOBS_API = f"{LINKEDIN_BASE}/jobs-guest/jobs/api"

UNKNOWN_COMPANY = "Unknown Company"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

JOB_TYPE_CODES: dict[str, str] = {
    "full-time": "F",
    "part-time": "P",
    "contract": "C",
    "temporary": "T",
    "internship": "I",
    "volunteer": "V",
    "other": "O",
}

EXPERIENCE_CODES: dict[str, str] = {
    "internship": "1",
    "entry-level": "2",
    "associate": "3",
    "mid-senior": "4",
    "director": "5",
    "executive": "6",
}

WORKPLACE_CODES: dict[str, str] = {
    "on-site": "1",
    "remote": "2",
    "hybrid": "3",
}

DATE_CODES: dict[str, str] = {
    "past-24-hours": "r86400",
    "past-week": "r604800",
    "past-month": "r2592000",
    "any-time": "",
}

POPULAR_LOCATIONS: list[dict[str, str]] = [
    {"name": "United States", "geoId": "103644278"},
    {"name": "New York, NY", "geoId": "102571732"},
    {"name": "San Francisco Bay Area", "geoId": "90000084"},
    {"name": "Los Angeles, CA", "geoId": "102448103"},
    {"name": "Seattle, WA", "geoId": "104116203"},
    {"name": "Austin, TX", "geoId": "104472866"},
    {"name": "Chicago, IL", "geoId": "103112676"},
    {"name": "Boston, MA", "geoId": "102380872"},
    {"name": "Denver, CO", "geoId": "103203548"},
    {"name": "United Kingdom", "geoId": "101165590"},
    {"name": "London, UK", "geoId": "102257491"},
    {"name": "Canada", "geoId": "101174742"},
    {"name": "Toronto, Canada", "geoId": "100025096"},
    {"name": "Germany", "geoId": "101282230"},
    {"name": "India", "geoId": "102713980"},
]

INDUSTRIES: list[str] = [
    "Technology, Information and Internet",
    "Hospitals and Health Care",
    "Financial Services",
    "IT Services and IT Consulting",
    "Software Development",
    "Retail",
    "Staffing and Recruiting",
    "Manufacturing",
    "Higher Education",
    "Banking",
    "Insurance",
    "Real Estate",
    "Construction",
    "Marketing Services",
    "Telecommunications",
    "Automotive",
    "Entertainment Providers",
    "Non-profit Organizations",
    "Government Administration",
    "Legal Services",
]

JOB_FUNCTIONS: list[str] = [
    "Engineering",
    "Information Technology",
    "Sales",
    "Marketing",
    "Human Resources",
    "Finance",
    "Operations",
    "Product Management",
    "Design",
    "Data Science",
    "Project Management",
    "Business Development",
    "Customer Service",
    "Legal",
    "Research",
    "Quality Assurance",
    "Administrative",
    "Consulting",
    "Writing/Editing",
    "Healthcare Services",
]

DEFAULT_LIMIT = 25
MAX_LIMIT = 50

# ── HTTP client ───────────────────────────────────────────────────────────────

_client = httpx.Client(
    base_url=LINKEDIN_BASE,
    headers=DEFAULT_HEADERS,
    timeout=30,
    follow_redirects=True,
)


# ── URL builders ──────────────────────────────────────────────────────────────

def _append_param(sp: list[tuple[str, str]], key: str, value: Any) -> None:
    if value:
        sp.append((key, str(value)))


def _encode_filter_codes(items: list[str], mapping: dict[str, str]) -> str | None:
    codes = [mapping[i] for i in items if i in mapping]
    return ",".join(codes) if codes else None


def build_search_url(params: dict[str, Any]) -> str:
    """Build the LinkedIn guest job-search API URL from filter params."""
    sp: list[tuple[str, str]] = []

    _append_param(sp, "keywords", params.get("keywords"))
    _append_param(sp, "location", params.get("location"))
    _append_param(sp, "geoId", params.get("geoId"))
    _append_param(sp, "distance", params.get("distance"))

    jt = _encode_filter_codes(params.get("jobType") or [], JOB_TYPE_CODES)
    if jt:
        sp.append(("f_JT", jt))

    fe = _encode_filter_codes(params.get("experienceLevel") or [], EXPERIENCE_CODES)
    if fe:
        sp.append(("f_E", fe))

    wt = _encode_filter_codes(params.get("workplaceType") or [], WORKPLACE_CODES)
    if wt:
        sp.append(("f_WT", wt))

    date_posted = params.get("datePosted")
    if date_posted and date_posted != "any-time" and date_posted in DATE_CODES:
        sp.append(("f_TPR", DATE_CODES[date_posted]))

    if params.get("easyApply"):
        sp.append(("f_AL", "true"))

    company_ids = params.get("companyIds") or []
    if company_ids:
        sp.append(("f_C", ",".join(str(c) for c in company_ids)))

    sort_by = params.get("sortBy", "most-relevant")
    sp.append(("sortBy", "DD" if sort_by == "most-recent" else "R"))

    _append_param(sp, "start", params.get("start", 0) or None)

    query = "&".join(f"{k}={v}" for k, v in sp)
    return f"{JOBS_API}/seeMoreJobPostings/search?{query}"


def build_public_job_url(params: dict[str, Any]) -> str:
    """Build a public-facing LinkedIn job search URL (for browser opening)."""
    sp: list[tuple[str, str]] = []

    if params.get("keywords"):
        sp.append(("keywords", str(params["keywords"])))
    if params.get("location"):
        sp.append(("location", str(params["location"])))

    job_types = params.get("jobType") or []
    if job_types:
        sp.append(("f_JT", ",".join(JOB_TYPE_CODES[t] for t in job_types if t in JOB_TYPE_CODES)))

    exp_levels = params.get("experienceLevel") or []
    if exp_levels:
        sp.append(("f_E", ",".join(EXPERIENCE_CODES[e] for e in exp_levels if e in EXPERIENCE_CODES)))

    workplace_types = params.get("workplaceType") or []
    if workplace_types:
        codes = [WORKPLACE_CODES[w] for w in workplace_types if w in WORKPLACE_CODES]
        if codes:
            sp.append(("f_WT", ",".join(codes)))

    date_posted = params.get("datePosted")
    if date_posted and date_posted != "any-time" and date_posted in DATE_CODES:
        sp.append(("f_TPR", DATE_CODES[date_posted]))

    if params.get("easyApply"):
        sp.append(("f_AL", "true"))

    query = "&".join(f"{k}={v}" for k, v in sp)
    return f"{LINKEDIN_BASE}/jobs/search/?{query}"


# ── Parsers ───────────────────────────────────────────────────────────────────

def _extract_job_id(url: str) -> str | None:
    for pattern in [r"/jobs/view/(\d+)", r"currentJobId=(\d+)", r"jobId=(\d+)", r"/(\d{10,})"]:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


def _extract_job_id_from_urn(urn: str) -> str | None:
    m = re.search(r"jobPosting:(\d+)", urn)
    return m.group(1) if m else None


def _detect_workplace_type(text: str) -> str:
    lower = text.lower()
    if "remote" in lower:
        return "remote"
    if "hybrid" in lower:
        return "hybrid"
    if "on-site" in lower or "onsite" in lower:
        return "on-site"
    return "unknown"


def _map_job_type(type_str: str) -> str:
    lower = type_str.lower()
    for key in ("full-time", "part-time", "contract", "temporary", "internship", "volunteer"):
        if key in lower:
            return key
    return "other"


def _map_experience_level(level_str: str) -> str | None:
    lower = level_str.lower()
    if "internship" in lower:
        return "internship"
    if "entry" in lower:
        return "entry-level"
    if "associate" in lower:
        return "associate"
    if "mid" in lower or "senior" in lower:
        return "mid-senior"
    if "director" in lower:
        return "director"
    if "executive" in lower:
        return "executive"
    return None


def _parse_number(text: str) -> int:
    m = re.search(r"[\d,]+", text)
    return int(m.group(0).replace(",", "")) if m else 0


def _extract_text(soup: BeautifulSoup, selectors: list[str]) -> str:
    for sel in selectors:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True)
    return ""


def _get_company_name(card: Tag) -> str:
    company_el = card.select_one("h4.base-search-card__subtitle")
    if not company_el:
        return UNKNOWN_COMPANY
    company_link = company_el.select_one("a")
    return company_link.get_text(strip=True) if company_link else company_el.get_text(strip=True)


def _parse_job_card(card: Tag) -> dict[str, Any] | None:
    """Parse a single job card <div> or <li> from search results HTML."""
    job_id = _extract_job_id_from_urn(card.get("data-entity-urn", ""))
    if not job_id:
        href = card.select_one("a.base-card__full-link, a")
        if href:
            job_id = _extract_job_id(href.get("href", "") or "")
    if not job_id:
        return None

    title_el = card.select_one("h3.base-search-card__title, .base-search-card__title")
    title = title_el.get_text(strip=True) if title_el else "Unknown Title"

    logo_el = card.select_one("img.artdeco-entity-image, img[data-delayed-url]")
    company_logo = logo_el.get("data-delayed-url") or logo_el.get("src") if logo_el else None

    loc_el = card.select_one(".job-search-card__location")
    location = loc_el.get_text(strip=True) if loc_el else "Unknown Location"

    time_el = card.select_one("time")
    posted_time_ago = time_el.get_text(strip=True) if time_el else "Unknown"
    posted_date = time_el.get("datetime", "") if time_el else ""

    salary_el = card.select_one(".job-search-card__salary-info")
    salary = salary_el.get_text(strip=True) if salary_el else None

    card_text = card.get_text(" ").lower()

    return {
        "id": job_id,
        "title": title,
        "company": _get_company_name(card),
        "companyLogo": company_logo,
        "location": location,
        "workplaceType": _detect_workplace_type(card_text),
        "jobType": "full-time",
        "postedDate": posted_date,
        "postedTimeAgo": posted_time_ago,
        "salary": salary,
        "url": f"{LINKEDIN_BASE}/jobs/view/{job_id}",
        "isEasyApply": "easy apply" in card_text,
        "isPromoted": "promoted" in card_text,
    }


def _parse_job_listings(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    jobs: list[dict[str, Any]] = []
    for card in soup.select("div.base-card, li"):
        try:
            job = _parse_job_card(card)
            if job:
                jobs.append(job)
        except Exception:
            continue
    return jobs


def _parse_total_results(html: str) -> int | None:
    soup = BeautifulSoup(html, "lxml")
    el = soup.select_one("span.results-context-header__job-count")
    if el:
        count = _parse_number(el.get_text(strip=True))
        return count if count > 0 else None
    return None


def _parse_job_details(html: str, job_id: str) -> dict[str, Any] | None:
    soup = BeautifulSoup(html, "lxml")
    try:
        title = _extract_text(soup, [
            "h1.top-card-layout__title",
            "h1.topcard__title",
            "h2.top-card-layout__title",
            ".top-card-layout__title",
            "h1",
        ])
        company = _extract_text(soup, [
            "a.topcard__org-name-link",
            ".topcard__flavor--black-link",
            'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
            ".top-card-layout__second-subline a",
        ])
        location = _extract_text(soup, [
            "span.topcard__flavor--bullet",
            ".top-card-layout__bullet",
            ".topcard__flavor",
        ])
        full_description = _extract_text(soup, [
            "div.show-more-less-html__markup",
            ".description__text",
            ".show-more-less-html",
            "section.description",
        ])
        posted_el = soup.select_one("span.posted-time-ago__text")
        posted_time_ago = posted_el.get_text(strip=True) if posted_el else "Unknown"
        applicants_el = soup.select_one("span.num-applicants__caption")
        applicants = applicants_el.get_text(strip=True) if applicants_el else None
        salary_el = soup.select_one("div.salary-main-rail")
        salary = salary_el.get_text(strip=True) if salary_el else None
        company_link_el = soup.select_one("a.topcard__org-name-link")
        company_linkedin_url = company_link_el.get("href") if company_link_el else None
        apply_btn = soup.select_one("button.jobs-apply-button")
        is_easy_apply = "easy apply" in apply_btn.get_text(strip=True).lower() if apply_btn else False

        # Job criteria (seniority, employment type, industries, job function)
        criteria: dict[str, str] = {}
        for item in soup.select("li.description__job-criteria-item"):
            label_el = item.select_one("h3")
            value_el = item.select_one("span")
            if label_el and value_el:
                criteria[label_el.get_text(strip=True).lower()] = value_el.get_text(strip=True)

        body_text = soup.get_text(" ").lower()

        return {
            "id": job_id,
            "title": title or "Unknown Title",
            "company": company or "Unknown Company",
            "location": location or "Unknown Location",
            "workplaceType": _detect_workplace_type(body_text),
            "jobType": _map_job_type(criteria.get("employment type", "")),
            "experienceLevel": _map_experience_level(criteria.get("seniority level", "")),
            "postedDate": "",
            "postedTimeAgo": posted_time_ago,
            "applicants": applicants,
            "salary": salary,
            "url": f"{LINKEDIN_BASE}/jobs/view/{job_id}",
            "isEasyApply": is_easy_apply,
            "isPromoted": False,
            "fullDescription": full_description,
            "seniorityLevel": criteria.get("seniority level"),
            "employmentType": criteria.get("employment type"),
            "industries": [s.strip() for s in criteria.get("industries", "").split(",") if s.strip()] or None,
            "jobFunctions": [s.strip() for s in criteria.get("job function", "").split(",") if s.strip()] or None,
            "companyLinkedInUrl": company_linkedin_url,
        }
    except Exception:
        return None


def _parse_company(html: str, company_id: str) -> dict[str, Any] | None:
    soup = BeautifulSoup(html, "lxml")
    try:
        name = _extract_text(soup, [
            "h1.org-top-card-summary__title",
            "h1.top-card-layout__title",
        ])
        description = _extract_text(soup, [
            "p.org-top-card-summary__tagline",
            ".org-about-company-module__description",
        ])
        logo_el = soup.select_one("img.org-top-card-primary-content__logo")
        logo = logo_el.get("src") if logo_el else None
        industry_el = soup.select_one("div.org-top-card-summary-info-list__info-item")
        industry = industry_el.get_text(strip=True) if industry_el else None
        website_el = soup.select_one("a.org-top-card-primary-actions__action")
        website = website_el.get("href") if website_el else None

        return {
            "id": company_id,
            "name": name or UNKNOWN_COMPANY,
            "description": description,
            "logo": logo,
            "industry": industry,
            "website": website,
            "linkedInUrl": f"{LINKEDIN_BASE}/company/{company_id}",
        }
    except Exception:
        return None


def _parse_company_search_results(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    companies: list[dict[str, Any]] = []
    for item in soup.select("li.reusable-search__result-container"):
        try:
            link_el = item.select_one("a.app-aware-link")
            href = link_el.get("href", "") if link_el else ""
            m = re.search(r"/company/([^/]+)", href)
            if not m:
                continue
            company_id = m.group(1)
            name_el = item.select_one(".entity-result__title-text")
            industry_el = item.select_one(".entity-result__primary-subtitle")
            logo_el = item.select_one("img.EntityPhoto-square-3")
            companies.append({
                "id": company_id,
                "name": name_el.get_text(strip=True) if name_el else "",
                "industry": industry_el.get_text(strip=True) if industry_el else None,
                "logo": logo_el.get("src") if logo_el else None,
                "linkedInUrl": f"{LINKEDIN_BASE}/company/{company_id}",
            })
        except Exception:
            continue
    return companies


# ── Public API ────────────────────────────────────────────────────────────────

def search_jobs(params: dict[str, Any]) -> dict[str, Any]:
    """Search for jobs on LinkedIn with comprehensive filters.

    Returns dict with keys: jobs, total_results, current_page, has_more, search_params.
    """
    url = build_search_url(params)
    limit = min(int(params.get("limit", DEFAULT_LIMIT)), MAX_LIMIT)
    start = int(params.get("start", 0))

    try:
        resp = _client.get(url)
        resp.raise_for_status()
        jobs = _parse_job_listings(resp.text)
        total_results = _parse_total_results(resp.text) or len(jobs) + start
        return {
            "jobs": jobs[:limit],
            "total_results": total_results,
            "current_page": start // 25 + 1,
            "has_more": len(jobs) >= 25,
            "search_params": params,
        }
    except httpx.HTTPError as exc:
        logger.exception("LinkedIn search failed")
        raise RuntimeError(f"LinkedIn search failed: {exc}") from exc


def get_job_details(job_id: str) -> dict[str, Any] | None:
    """Get detailed information about a specific job posting."""
    try:
        resp = _client.get(f"/jobs/view/{job_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return _parse_job_details(resp.text, job_id)
    except httpx.HTTPError as exc:
        logger.exception("Failed to get job details for %s", job_id)
        raise RuntimeError(f"Failed to get job details: {exc}") from exc


def search_remote_jobs(
    keywords: str,
    date_posted: str = "past-week",
    experience_level: list[str] | None = None,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    """Quick search for remote jobs."""
    return search_jobs({
        "keywords": keywords,
        "workplaceType": ["remote"],
        "datePosted": date_posted,
        "experienceLevel": experience_level,
        "limit": limit,
    })


def search_entry_level_jobs(
    keywords: str,
    location: str | None = None,
    include_internships: bool = True,
    date_posted: str = "past-week",
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    """Search specifically for entry-level and internship positions."""
    levels = ["entry-level"]
    if include_internships:
        levels.append("internship")
    return search_jobs({
        "keywords": keywords,
        "location": location,
        "experienceLevel": levels,
        "datePosted": date_posted,
        "limit": limit,
    })


def get_company(company_id: str) -> dict[str, Any] | None:
    """Get information about a company on LinkedIn."""
    try:
        resp = _client.get(f"/company/{company_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return _parse_company(resp.text, company_id)
    except httpx.HTTPError as exc:
        logger.exception("Failed to get company %s", company_id)
        raise RuntimeError(f"Failed to get company: {exc}") from exc


def search_companies(query: str) -> list[dict[str, Any]]:
    """Search for companies on LinkedIn."""
    try:
        resp = _client.get("/search/results/companies/", params={"keywords": query})
        resp.raise_for_status()
        return _parse_company_search_results(resp.text)
    except httpx.HTTPError as exc:
        logger.exception("Company search failed")
        raise RuntimeError(f"Company search failed: {exc}") from exc


def get_company_jobs(
    company_id: str,
    keywords: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    """Get job listings from a specific company."""
    return search_jobs({
        "keywords": keywords,
        "companyIds": [company_id],
        "limit": limit,
    })


def get_popular_locations() -> list[dict[str, str]]:
    """Return popular job search locations with LinkedIn geo IDs."""
    return list(POPULAR_LOCATIONS)


def get_industries() -> list[str]:
    """Return LinkedIn industry categories."""
    return list(INDUSTRIES)


def get_job_functions() -> list[str]:
    """Return LinkedIn job function categories."""
    return list(JOB_FUNCTIONS)
