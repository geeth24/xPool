from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class JobStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"


class InterviewStage(str, Enum):
    NOT_REACHED_OUT = "not_reached_out"
    REACHED_OUT = "reached_out"
    PHONE_SCREEN = "phone_screen"
    STAGE_1 = "stage_1"
    STAGE_2 = "stage_2"
    FINAL = "final"
    OFFER = "offer"
    REJECTED = "rejected"
    HIRED = "hired"


class CandidateStatus(str, Enum):
    SOURCED = "sourced"
    SHORTLISTED = "shortlisted"
    INTERVIEWING = "interviewing"
    REJECTED = "rejected"
    HIRED = "hired"


class CandidateType(str, Enum):
    DEVELOPER = "developer"
    INFLUENCER = "influencer"
    RECRUITER = "recruiter"
    COMPANY = "company"
    BOT = "bot"
    UNKNOWN = "unknown"


# Job schemas
class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    keywords: List[str] = []
    requirements: Optional[str] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    requirements: Optional[str] = None
    status: Optional[JobStatus] = None


class SearchStrategy(BaseModel):
    """AI-generated search strategy for GitHub sourcing."""
    bio_keywords: List[str] = []
    repo_topics: List[str] = []
    languages: List[str] = []
    location_suggestions: List[str] = []
    negative_keywords: List[str] = []
    seniority_signals: Optional[dict] = None
    role_type: str = "unknown"


class JobResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    keywords: List[str]
    requirements: Optional[str]
    status: JobStatus
    search_strategy: Optional[SearchStrategy] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Candidate schemas
class CandidateCreate(BaseModel):
    x_user_id: str
    x_username: str
    display_name: Optional[str] = None
    bio: Optional[str] = None
    profile_url: Optional[str] = None
    followers_count: int = 0
    following_count: int = 0
    github_url: Optional[str] = None
    website_url: Optional[str] = None


class CandidateUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    github_url: Optional[str] = None
    website_url: Optional[str] = None
    grok_summary: Optional[str] = None
    skills_extracted: Optional[List[str]] = None
    codeforces_rating: Optional[int] = None
    github_repos_count: Optional[int] = None
    years_experience: Optional[int] = None
    location: Optional[str] = None


class CandidateResponse(BaseModel):
    id: str
    # X identifiers (nullable for GitHub-only candidates)
    x_user_id: Optional[str] = None
    x_username: Optional[str] = None
    # GitHub identifiers (nullable for X-only candidates)
    github_id: Optional[str] = None
    github_username: Optional[str] = None
    display_name: Optional[str]
    bio: Optional[str]
    profile_url: Optional[str]
    followers_count: int
    following_count: int
    github_url: Optional[str]
    website_url: Optional[str]
    # contact info
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    phone: Optional[str] = None
    grok_summary: Optional[str]
    skills_extracted: List[str]
    codeforces_rating: Optional[int]
    github_repos_count: Optional[int]
    years_experience: Optional[int]
    location: Optional[str]
    candidate_type: Optional[CandidateType] = None
    type_confidence: Optional[float] = None
    tweet_analysis: Optional[dict] = None
    sourced_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Job-Candidate relationship schemas
class JobCandidateCreate(BaseModel):
    status: Optional[CandidateStatus] = CandidateStatus.SOURCED
    interview_stage: Optional[InterviewStage] = InterviewStage.NOT_REACHED_OUT
    notes: Optional[str] = None


class JobCandidateUpdate(BaseModel):
    status: Optional[CandidateStatus] = None
    interview_stage: Optional[InterviewStage] = None
    notes: Optional[str] = None


class EvidenceCard(BaseModel):
    """Evidence card showing why a candidate matches a job."""
    relevant_repos: List[dict] = []
    signals: List[str] = []
    why_matched: str = ""
    match_strength: str = "unknown"  # strong, moderate, weak, mismatch
    green_flags: List[str] = []
    red_flags: List[str] = []
    suggested_questions: List[str] = []
    outreach_hook: str = ""


class JobCandidateResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    status: CandidateStatus
    interview_stage: InterviewStage
    notes: Optional[str]
    match_score: Optional[float]
    evidence: Optional[EvidenceCard] = None  # AI-generated evidence card
    added_at: datetime
    updated_at: datetime
    candidate: Optional[CandidateResponse] = None
    
    class Config:
        from_attributes = True


# Recruiter action tracking for self-improving ranking
class RecruiterActionCreate(BaseModel):
    action: str = Field(..., description="Action type: view, shortlist, contact, reject, hire")
    time_spent_seconds: Optional[int] = None


class RecruiterActionResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    action: str
    time_spent_seconds: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Candidate verification/claim flow
class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"


class CandidateProof(BaseModel):
    type: str  # repo, project, blog, talk
    url: str
    description: Optional[str] = None


class VerificationRequest(BaseModel):
    verification_method: str = Field(..., description="github_oauth, x_oauth, email")
    email: Optional[str] = None
    proofs: List[CandidateProof] = []
    preferred_contact: Optional[str] = None  # email, x_dm, linkedin
    open_to_opportunities: int = Field(default=1, ge=0, le=2)  # 0=no, 1=yes, 2=passive


class VerificationResponse(BaseModel):
    candidate_id: str
    is_verified: int
    verification_method: Optional[str]
    proofs: List[dict]
    email: Optional[str]
    preferred_contact: Optional[str]
    open_to_opportunities: int
    verified_at: Optional[datetime]
    
    class Config:
        from_attributes = True


# Search schemas
class SearchFilters(BaseModel):
    interview_stage: Optional[List[InterviewStage]] = None
    status: Optional[List[CandidateStatus]] = None
    min_codeforces_rating: Optional[int] = None
    max_codeforces_rating: Optional[int] = None
    min_followers: Optional[int] = None
    min_years_experience: Optional[int] = None
    job_id: Optional[str] = None
    skills: Optional[List[str]] = None


class CandidateSearchRequest(BaseModel):
    query: Optional[str] = None
    filters: Optional[SearchFilters] = None
    sort_by: Optional[str] = "match_score"
    sort_order: Optional[str] = "desc"
    top_k: int = Field(default=10, ge=1, le=100)


class CandidateSearchResponse(BaseModel):
    candidates: List[CandidateResponse]
    total: int
    query: Optional[str]
    

# Evidence Feedback schemas
class EvidenceFeedbackCreate(BaseModel):
    """Request to submit feedback on an evidence card."""
    feedback_type: str = Field(..., description="Type of feedback: 'positive' or 'negative'")
    feedback_target: Optional[str] = Field(default="overall", description="Which part: 'match_strength', 'signals', 'repos', 'flags', 'questions', 'outreach', 'overall'")
    comment: Optional[str] = Field(default=None, description="Optional comment explaining the feedback")


class EvidenceFeedbackResponse(BaseModel):
    id: str
    job_id: str
    candidate_id: str
    feedback_type: str
    feedback_target: Optional[str]
    comment: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Sourcing schemas
class SourceRequest(BaseModel):
    max_results: int = Field(default=20, ge=1, le=100)
    regions: Optional[List[str]] = Field(default=None, description="List of regions/countries to filter by (e.g., ['USA', 'UK', 'India'])")
    search_queries: Optional[List[str]] = Field(default=None, description="Custom search queries to use instead of keywords")
    exclude_influencers: bool = Field(default=True, description="Filter out influencers and content creators")
    min_tweets_analyzed: int = Field(default=10, description="Minimum tweets to analyze per user")
    use_full_archive: bool = Field(default=True, description="Use /tweets/search/all (full archive search, better results)")


class GitHubSourceRequest(BaseModel):
    search_query: str = Field(..., description="Search query for GitHub users (e.g., 'machine learning engineer')")
    language: Optional[str] = Field(default=None, description="Primary programming language filter (e.g., 'python', 'swift')")
    location: Optional[str] = Field(default=None, description="Location filter (e.g., 'San Francisco', 'USA')")
    skills: Optional[List[str]] = Field(default=None, description="List of skills to search for (e.g., ['Swift', 'SwiftUI', 'iOS'])")
    min_followers: int = Field(default=5, ge=0, description="Minimum GitHub followers")
    min_repos: int = Field(default=3, ge=0, description="Minimum public repositories")
    max_results: int = Field(default=20, ge=1, le=100, description="Maximum candidates to source")
    require_x_profile: bool = Field(default=False, description="Only include candidates with X profiles")
    min_dev_score: int = Field(default=50, ge=0, le=100, description="Minimum developer score (0-100)")

