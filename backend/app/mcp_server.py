"""LinkedIn Job Search MCP Server.

Exposes LinkedIn scraping functions as MCP tools via FastMCP.
Run standalone:  python -m app.mcp_server
"""

from __future__ import annotations

import json
import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

# Import scraping functions with _impl suffix to avoid name collision with @mcp.tool() functions
from app.linkedin_tools import (
    build_public_job_url as _build_public_job_url,
    get_company as _get_company,
    get_company_jobs as _get_company_jobs,
    get_industries as _get_industries,
    get_job_details as _get_job_details,
    get_job_functions as _get_job_functions,
    get_popular_locations as _get_popular_locations,
    search_companies as _search_companies,
    search_entry_level_jobs as _search_entry_level_jobs,
    search_jobs as _search_jobs,
    search_remote_jobs as _search_remote_jobs,
)

logger = logging.getLogger(__name__)

mcp = FastMCP("linkedin-job-search")


def _to_json(data: Any) -> str:
    """Serialize tool output to JSON string for MCP response."""
    return json.dumps(data, ensure_ascii=False, default=str)


# ── Job Tools ─────────────────────────────────────────────────────────────────

@mcp.tool()
def search_jobs(
    keywords: str,
    location: str = "",
    geo_id: str = "",
    distance: int = 0,
    job_type: list[str] | None = None,
    experience_level: list[str] | None = None,
    workplace_type: list[str] | None = None,
    date_posted: str = "any-time",
    easy_apply: bool = False,
    company_ids: list[str] | None = None,
    sort_by: str = "most-relevant",
    start: int = 0,
    limit: int = 25,
) -> str:
    """Search for jobs on LinkedIn with comprehensive filters. No authentication required.

    Args:
        keywords: Job search keywords (e.g. "software engineer", "product manager python").
        location: Location to search in (e.g. "San Francisco, CA", "Remote", "United States").
        geo_id: LinkedIn geographic ID for more precise location filtering.
        distance: Search radius in miles (5, 10, 25, 50, 100).
        job_type: Filter by job type(s) — "full-time", "part-time", "contract", "temporary", "internship", "volunteer".
        experience_level: Filter by experience — "internship", "entry-level", "associate", "mid-senior", "director", "executive".
        workplace_type: Filter by workplace — "on-site", "remote", "hybrid".
        date_posted: Filter by recency — "past-24-hours", "past-week", "past-month", "any-time".
        easy_apply: Only show jobs with Easy Apply option.
        company_ids: Filter by specific company IDs.
        sort_by: Sort results — "most-relevant" or "most-recent".
        start: Pagination offset (default 0).
        limit: Maximum results to return (default 25, max 50).
    """
    params: dict[str, Any] = {"keywords": keywords}
    if location:
        params["location"] = location
    if geo_id:
        params["geoId"] = geo_id
    if distance:
        params["distance"] = distance
    if job_type:
        params["jobType"] = job_type
    if experience_level:
        params["experienceLevel"] = experience_level
    if workplace_type:
        params["workplaceType"] = workplace_type
    if date_posted and date_posted != "any-time":
        params["datePosted"] = date_posted
    if easy_apply:
        params["easyApply"] = True
    if company_ids:
        params["companyIds"] = company_ids
    if sort_by:
        params["sortBy"] = sort_by
    if start:
        params["start"] = start
    params["limit"] = min(limit, 50)

    try:
        result = _search_jobs(params)
        return _to_json({
            "success": True,
            "total_results": result["total_results"],
            "current_page": result["current_page"],
            "has_more": result["has_more"],
            "job_count": len(result["jobs"]),
            "jobs": result["jobs"],
        })
    except Exception as exc:
        logger.exception("search_jobs failed")
        return _to_json({"success": False, "error": str(exc)})


@mcp.tool()
def get_job_details(job_id: str) -> str:
    """Get detailed information about a specific job posting.

    Args:
        job_id: The LinkedIn job ID.
    """
    try:
        job = _get_job_details(job_id)
        if not job:
            return _to_json({"success": False, "error": "Job not found"})
        return _to_json({"success": True, "job": job})
    except Exception as exc:
        logger.exception("get_job_details failed")
        return _to_json({"success": False, "error": str(exc)})


@mcp.tool()
def search_remote_jobs(
    keywords: str,
    date_posted: str = "past-week",
    experience_level: list[str] | None = None,
    limit: int = 25,
) -> str:
    """Quick search for remote jobs with keywords.

    Args:
        keywords: Job search keywords.
        date_posted: Filter by recency — "past-24-hours", "past-week", "past-month", "any-time".
        experience_level: Filter by experience level(s).
        limit: Maximum results to return (default 25).
    """
    try:
        result = _search_remote_jobs(
            keywords,
            date_posted=date_posted,
            experience_level=experience_level,
            limit=limit,
        )
        return _to_json({
            "success": True,
            "search_type": "remote_jobs",
            "total_results": result["total_results"],
            "job_count": len(result["jobs"]),
            "jobs": result["jobs"],
        })
    except Exception as exc:
        logger.exception("search_remote_jobs failed")
        return _to_json({"success": False, "error": str(exc)})


@mcp.tool()
def search_entry_level_jobs(
    keywords: str,
    location: str = "",
    include_internships: bool = True,
    date_posted: str = "past-week",
    limit: int = 25,
) -> str:
    """Search specifically for entry-level and internship positions.

    Args:
        keywords: Job search keywords.
        location: Location to search in.
        include_internships: Include internship positions (default True).
        date_posted: Filter by recency — "past-24-hours", "past-week", "past-month", "any-time".
        limit: Maximum results to return (default 25).
    """
    try:
        result = _search_entry_level_jobs(
            keywords,
            location=location,
            include_internships=include_internships,
            date_posted=date_posted,
            limit=limit,
        )
        return _to_json({
            "success": True,
            "search_type": "entry_level_jobs",
            "total_results": result["total_results"],
            "job_count": len(result["jobs"]),
            "jobs": result["jobs"],
        })
    except Exception as exc:
        logger.exception("search_entry_level_jobs failed")
        return _to_json({"success": False, "error": str(exc)})


# ── Company Tools ─────────────────────────────────────────────────────────────

@mcp.tool()
def get_company(company_id: str) -> str:
    """Get information about a company on LinkedIn.

    Args:
        company_id: The LinkedIn company ID or vanity name (e.g. "google", "microsoft").
    """
    try:
        company = _get_company(company_id)
        if not company:
            return _to_json({"success": False, "error": "Company not found"})
        return _to_json({"success": True, "company": company})
    except Exception as exc:
        logger.exception("get_company failed")
        return _to_json({"success": False, "error": str(exc)})


@mcp.tool()
def search_companies(query: str) -> str:
    """Search for companies on LinkedIn.

    Args:
        query: Company search query.
    """
    try:
        companies = _search_companies(query)
        return _to_json({"success": True, "count": len(companies), "companies": companies})
    except Exception as exc:
        logger.exception("search_companies failed")
        return _to_json({"success": False, "error": str(exc)})


@mcp.tool()
def get_company_jobs(
    company_id: str,
    keywords: str = "",
    limit: int = 25,
) -> str:
    """Get job listings from a specific company.

    Args:
        company_id: The LinkedIn company ID.
        keywords: Additional keywords to filter jobs.
        limit: Maximum results to return (default 25).
    """
    try:
        result = _get_company_jobs(company_id, keywords=keywords or None, limit=limit)
        return _to_json({
            "success": True,
            "company_id": company_id,
            "total_results": result["total_results"],
            "job_count": len(result["jobs"]),
            "jobs": result["jobs"],
        })
    except Exception as exc:
        logger.exception("get_company_jobs failed")
        return _to_json({"success": False, "error": str(exc)})


# ── Helper / Utility Tools ────────────────────────────────────────────────────

@mcp.tool()
def get_popular_locations() -> str:
    """Get a list of popular job search locations with their LinkedIn geographic IDs."""
    locations = _get_popular_locations()
    return _to_json({"locations": locations})


@mcp.tool()
def get_industries() -> str:
    """Get a list of LinkedIn industry categories."""
    industries = _get_industries()
    return _to_json({"industries": industries})


@mcp.tool()
def get_job_functions() -> str:
    """Get a list of LinkedIn job function categories."""
    functions = _get_job_functions()
    return _to_json({"job_functions": functions})


@mcp.tool()
def build_job_search_url(
    keywords: str = "",
    location: str = "",
    job_type: list[str] | None = None,
    experience_level: list[str] | None = None,
    workplace_type: list[str] | None = None,
    date_posted: str = "any-time",
    easy_apply: bool = False,
) -> str:
    """Generate a LinkedIn job search URL that can be opened in a browser.

    Args:
        keywords: Job search keywords.
        location: Location to search in.
        job_type: Filter by job type(s).
        experience_level: Filter by experience level(s).
        workplace_type: Filter by workplace type(s).
        date_posted: Filter by recency.
        easy_apply: Only Easy Apply jobs.
    """
    params: dict[str, Any] = {}
    if keywords:
        params["keywords"] = keywords
    if location:
        params["location"] = location
    if job_type:
        params["jobType"] = job_type
    if experience_level:
        params["experienceLevel"] = experience_level
    if workplace_type:
        params["workplaceType"] = workplace_type
    if date_posted and date_posted != "any-time":
        params["datePosted"] = date_posted
    if easy_apply:
        params["easyApply"] = True

    url = _build_public_job_url(params)
    return _to_json({"url": url})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
