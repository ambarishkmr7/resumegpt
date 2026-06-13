from datetime import datetime
from typing import List, Optional, Any

from pydantic import BaseModel, EmailStr, Field, model_validator


# ---------- Normalized resume content (the core data contract) ----------

class Contact(BaseModel):
    name: str = ""
    title: str = ""           # professional headline e.g. "Senior Backend Engineer"
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""


class ExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    bullets: List[str] = Field(default_factory=list)


class EducationItem(BaseModel):
    degree: str = ""
    school: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    details: str = ""


class ProjectItem(BaseModel):
    name: str = ""
    description: str = ""
    bullets: List[str] = Field(default_factory=list)


class SkillRating(BaseModel):
    name: str = ""
    rating: int = 3  # 1-5 stars


class ReferenceItem(BaseModel):
    name: str = ""
    title: str = ""
    company: str = ""
    contact: str = ""  # email or phone


class CustomSection(BaseModel):
    title: str = ""
    items: List[str] = Field(default_factory=list)


class ResumeContent(BaseModel):
    contact: Contact = Field(default_factory=Contact)
    profile_photo: str = ""  # base64 data URL
    summary: str = ""
    experience: List[ExperienceItem] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    skill_ratings: List[SkillRating] = Field(default_factory=list)
    core_competencies: List[str] = Field(default_factory=list)
    projects: List[ProjectItem] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    accomplishments: List[str] = Field(default_factory=list)
    activities: List[str] = Field(default_factory=list)
    references: List[ReferenceItem] = Field(default_factory=list)
    custom_sections: List[CustomSection] = Field(default_factory=list)
    section_order: List[str] = Field(default_factory=lambda: [
        "summary", "contact", "skill_ratings", "skills", "core_competencies", "certifications",
        "experience", "education", "accomplishments", "languages",
        "projects", "activities", "references",
    ])

    @model_validator(mode="before")
    @classmethod
    def normalize_ai_output(cls, data):
        """Normalize AI-generated content to match the expected schema."""
        if isinstance(data, dict):
            # Normalize certifications: convert objects to strings
            certs = data.get("certifications")
            if certs and isinstance(certs, list):
                normalized = []
                for c in certs:
                    if isinstance(c, dict):
                        name = c.get("name", c.get("title", ""))
                        year = c.get("year", c.get("date", ""))
                        normalized.append(f"{name} ({year})".strip(" ()") if year else str(name))
                    else:
                        normalized.append(str(c))
                data["certifications"] = normalized

            # Normalize references: convert strings to ReferenceItem dicts
            refs = data.get("references")
            if refs and isinstance(refs, list):
                normalized = []
                for r in refs:
                    if isinstance(r, str):
                        normalized.append({"name": r, "title": "", "company": "", "contact": ""})
                    else:
                        normalized.append(r)
                data["references"] = normalized

        return data


# ---------- Auth ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


# ---------- Resume API ----------

class ResumeCreate(BaseModel):
    title: str = "Untitled Resume"
    template_id: str = "classic"
    content: ResumeContent = Field(default_factory=ResumeContent)


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[str] = None
    content: Optional[ResumeContent] = None


class ResumeOut(BaseModel):
    id: str
    title: str
    template_id: str
    content: ResumeContent
    ats_score: Optional[int] = None
    original_filename: Optional[str] = None
    career_analysis: Optional["CareerAnalysisResponse"] = None
    career_roadmap: Optional["CareerRoadmapResponse"] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------- ATS ----------

class ATSRequest(BaseModel):
    content: ResumeContent
    job_description: Optional[str] = None


class ATSIssue(BaseModel):
    category: str          # e.g. "Contact", "Impact", "Keywords"
    severity: str          # "critical" | "warning" | "info"
    message: str
    suggestion: str


class ATSResult(BaseModel):
    score: int
    breakdown: dict        # category -> points earned
    issues: List[ATSIssue]
    matched_keywords: List[str] = Field(default_factory=list)
    missing_keywords: List[str] = Field(default_factory=list)


# ---------- AI ----------

class CoverLetterRequest(BaseModel):
    content: ResumeContent
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None
    tone: str = "professional"


class CoverLetterResponse(BaseModel):
    cover_letter: str


class SuggestRequest(BaseModel):
    content: ResumeContent
    job_description: Optional[str] = None


class SuggestResponse(BaseModel):
    improved_content: ResumeContent
    notes: List[str] = Field(default_factory=list)


# ---------- AI Analysis ----------

class CareerAnalysisRequest(BaseModel):
    content: ResumeContent
    job_description: Optional[str] = None
    resume_id: Optional[str] = None  # If provided, cache result in DB


class WeaknessItem(BaseModel):
    text: str = ""
    urgency: str = "Medium Priority"  # "High Priority" | "Medium Priority" | "Low Priority"


class RecommendationItem(BaseModel):
    text: str = ""
    impact: str = "Strategic"  # "High Impact" | "Quick Win" | "Long-term" | "Critical" | "Strategic"
    why_it_matters: str = ""


class CareerAnalysisResponse(BaseModel):
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[WeaknessItem] = Field(default_factory=list)
    recommendations: List[RecommendationItem] = Field(default_factory=list)
    overall_assessment: str = ""


class CareerRoadmapRequest(BaseModel):
    content: ResumeContent
    target_role: Optional[str] = None
    resume_id: Optional[str] = None  # If provided, cache result in DB


class CertificationDetail(BaseModel):
    name: str = ""
    institution: str = ""
    udemy_url: str = ""
    description: str = ""


class YouTubeChannel(BaseModel):
    name: str = ""
    url: str = ""
    topic: str = ""


class LearningResource(BaseModel):
    platform: str = ""
    url: str = ""
    description: str = ""


class RoadmapStepItem(BaseModel):
    text: str = ""
    timeframe: str = ""
    category: str = "Growth"  # Skills | Leadership | Credentials | Portfolio | Network | Visibility | Mentoring | Strategy | Execution | Growth
    explanation: str = ""


class CareerRoadmapResponse(BaseModel):
    current_level: str = ""
    next_roles: List[str] = Field(default_factory=list)
    roadmap_steps: List[RoadmapStepItem] = Field(default_factory=list)
    recommended_certifications: List[CertificationDetail] = Field(default_factory=list)
    skill_gaps: List[str] = Field(default_factory=list)
    timeline: str = ""
    youtube_channels: List[YouTubeChannel] = Field(default_factory=list)
    learning_resources: List[LearningResource] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def coerce_roadmap_steps(cls, data: Any) -> Any:
        """Ensure roadmap_steps items are dicts, not plain strings.
        Handles legacy cached data where steps were stored as strings."""
        if isinstance(data, dict):
            steps = data.get("roadmap_steps")
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
                data["roadmap_steps"] = coerced
        return data


class JobSuggestion(BaseModel):
    company: str = ""
    role: str = ""
    match_reason: str = ""
    glassdoor_rating: Optional[float] = None
    glassdoor_url: str = ""
    linkedin_search_url: str = ""
    naukri_search_url: str = ""
    indeed_search_url: str = ""


class CareerJobsRequest(BaseModel):
    content: ResumeContent
    target_role: Optional[str] = None
    location: Optional[str] = None


class CareerJobsResponse(BaseModel):
    suggestions: List[JobSuggestion] = Field(default_factory=list)
    linkedin_job_url: str = ""
    naukri_job_url: str = ""
    indeed_job_url: str = ""
    remote_jobs_url: str = ""


class WriteupRequest(BaseModel):
    content: ResumeContent
    purpose: str = "linkedin"  # linkedin | naukri | portfolio | bio


class WriteupResponse(BaseModel):
    writeup: str = ""


class RewriteRequest(BaseModel):
    content: ResumeContent
    job_description: Optional[str] = None
    num_variants: int = 3


class RewriteVariant(BaseModel):
    label: str = ""
    description: str = ""
    content: ResumeContent


class RewriteResponse(BaseModel):
    variants: List[RewriteVariant] = Field(default_factory=list)


# ---------- Subscription ----------

class SubscriptionStatus(BaseModel):
    is_subscribed: bool = False
    amount: int = 299
    payment_id: Optional[str] = None
    created_at: Optional[str] = None


class CheckoutRequest(BaseModel):
    payment_id: str  # from payment gateway


class GenerateSampleRequest(BaseModel):
    job_title: str
    years_experience: int = 3
    name: str = "Your Name"


# ---------- User Profile ----------

class PersonalInfo(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin_url: str = ""
    headline: str = ""
    summary: str = ""


class ProfileEducationItem(BaseModel):
    degree: str = ""
    school: str = ""
    location: str = ""
    start_year: str = ""
    end_year: str = ""
    grade: str = ""


class ProfileExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    current: bool = False
    description: str = ""


class ProfilePreferences(BaseModel):
    desired_role: str = ""
    preferred_locations: List[str] = Field(default_factory=list)
    expected_salary_min: str = ""
    expected_salary_max: str = ""
    job_type: str = ""        # full-time | part-time | contract | freelance
    remote_preference: str = ""  # remote | hybrid | onsite | flexible


class UserProfileUpdate(BaseModel):
    personal: Optional[PersonalInfo] = None
    education: Optional[List[ProfileEducationItem]] = None
    experience: Optional[List[ProfileExperienceItem]] = None
    skills: Optional[List[str]] = None
    preferences: Optional[ProfilePreferences] = None


class UserProfileOut(BaseModel):
    user_id: str
    personal: PersonalInfo = Field(default_factory=PersonalInfo)
    education: List[ProfileEducationItem] = Field(default_factory=list)
    experience: List[ProfileExperienceItem] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    preferences: ProfilePreferences = Field(default_factory=ProfilePreferences)
    profile_photo_key: Optional[str] = None
    profile_completion: int = 0
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Resolve forward references for ResumeOut (which references CareerAnalysisResponse
# and CareerRoadmapResponse defined earlier in this file via string annotations)
ResumeOut.model_rebuild()
