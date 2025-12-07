from sqlalchemy import create_engine, Column, String, Integer, Float, Text, DateTime, ForeignKey, LargeBinary, JSON, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid
import enum

from config import settings

# PostgreSQL doesn't need check_same_thread
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_uuid():
    return str(uuid.uuid4())


class JobStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"


class InterviewStage(str, enum.Enum):
    NOT_REACHED_OUT = "not_reached_out"
    REACHED_OUT = "reached_out"
    PHONE_SCREEN = "phone_screen"
    STAGE_1 = "stage_1"
    STAGE_2 = "stage_2"
    FINAL = "final"
    OFFER = "offer"
    REJECTED = "rejected"
    HIRED = "hired"


class CandidateStatus(str, enum.Enum):
    SOURCED = "sourced"
    SHORTLISTED = "shortlisted"
    INTERVIEWING = "interviewing"
    REJECTED = "rejected"
    HIRED = "hired"


class CandidateType(str, enum.Enum):
    DEVELOPER = "developer"
    INFLUENCER = "influencer"
    RECRUITER = "recruiter"
    COMPANY = "company"
    BOT = "bot"
    UNKNOWN = "unknown"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text)
    keywords = Column(JSON, default=list)
    requirements = Column(Text)
    status = Column(SQLEnum(JobStatus), default=JobStatus.ACTIVE)
    requirement_embedding = Column(LargeBinary, nullable=True)
    # AI-generated search strategy for GitHub sourcing
    search_strategy = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidates = relationship("JobCandidate", back_populates="job", cascade="all, delete-orphan")
    recruiter_actions = relationship(
        "RecruiterAction", back_populates="job", cascade="all, delete-orphan"
    )
    evidence_feedback = relationship(
        "EvidenceFeedback", back_populates="job", cascade="all, delete-orphan"
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(String, primary_key=True, default=generate_uuid)

    # X identifiers - nullable for GitHub-only candidates
    x_user_id = Column(String, unique=True, nullable=True)
    x_username = Column(String, nullable=True)

    # GitHub identifiers - nullable for X-only candidates
    github_id = Column(String, unique=True, nullable=True)
    github_username = Column(String, nullable=True)

    display_name = Column(String)
    bio = Column(Text)
    profile_url = Column(String)
    followers_count = Column(Integer, default=0)
    following_count = Column(Integer, default=0)

    github_url = Column(String, nullable=True)
    website_url = Column(String, nullable=True)

    # contact info
    email = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    grok_summary = Column(Text, nullable=True)
    raw_tweets = Column(JSON, default=list)
    skills_extracted = Column(JSON, default=list)

    codeforces_rating = Column(Integer, nullable=True)
    github_repos_count = Column(Integer, nullable=True)
    years_experience = Column(Integer, nullable=True)
    location = Column(String, nullable=True)

    # classification based on tweet analysis
    candidate_type = Column(SQLEnum(CandidateType), default=CandidateType.UNKNOWN)
    type_confidence = Column(Float, nullable=True)  # 0-1 confidence score
    tweet_analysis = Column(JSON, nullable=True)  # detailed analysis from Grok

    embedding = Column(LargeBinary, nullable=True)

    sourced_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    jobs = relationship("JobCandidate", back_populates="candidate", cascade="all, delete-orphan")


class JobCandidate(Base):
    __tablename__ = "job_candidates"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(String, ForeignKey("candidates.id"), nullable=False)
    
    status = Column(SQLEnum(CandidateStatus), default=CandidateStatus.SOURCED)
    interview_stage = Column(SQLEnum(InterviewStage), default=InterviewStage.NOT_REACHED_OUT)
    notes = Column(Text, nullable=True)
    match_score = Column(Float, nullable=True)
    
    # Evidence cards - AI-generated match explanation
    evidence = Column(JSON, nullable=True)  # {relevant_repos, signals, why_matched, red_flags, green_flags}
    
    added_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    job = relationship("Job", back_populates="candidates")
    candidate = relationship("Candidate", back_populates="jobs")


class RecruiterAction(Base):
    """Track recruiter actions per job for self-improving ranking."""
    __tablename__ = "recruiter_actions"

    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(String, ForeignKey("candidates.id"), nullable=False)

    # Action types: view, shortlist, contact, reject, hire
    action = Column(String, nullable=False)

    # Time spent viewing profile (for implicit signals)
    time_spent_seconds = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="recruiter_actions")
    candidate = relationship("Candidate")


class CandidateVerification(Base):
    """Track candidate verification/claim status."""
    __tablename__ = "candidate_verifications"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    candidate_id = Column(String, ForeignKey("candidates.id"), nullable=False, unique=True)
    
    # Verification status
    is_verified = Column(Integer, default=0)  # 0=unverified, 1=pending, 2=verified
    verification_method = Column(String, nullable=True)  # github_oauth, x_oauth, email
    verified_at = Column(DateTime, nullable=True)
    
    # Canonical proofs provided by candidate
    proofs = Column(JSON, default=list)  # [{type: "repo", url: "...", description: "..."}, ...]
    
    # Contact preferences
    email = Column(String, nullable=True)
    preferred_contact = Column(String, nullable=True)  # email, x_dm, linkedin
    open_to_opportunities = Column(Integer, default=1)  # 0=no, 1=yes, 2=passive
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    candidate = relationship("Candidate")


class EvidenceFeedback(Base):
    """Track user feedback on AI-generated evidence cards for learning."""
    __tablename__ = "evidence_feedback"

    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(String, ForeignKey("candidates.id"), nullable=False)

    # feedback type: positive or negative
    feedback_type = Column(String, nullable=False)  # "positive" or "negative"

    # which part of the evidence was good/bad
    feedback_target = Column(String, nullable=True)  # "match_strength", "signals", "repos", "flags", "questions", "outreach", "overall"

    # optional user comment explaining why
    comment = Column(Text, nullable=True)

    # snapshot of the evidence at time of feedback
    evidence_snapshot = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="evidence_feedback")
    candidate = relationship("Candidate")


class RoleSuccessPattern(Base):
    """
    MemOS-style memory: stores learned patterns about what makes successful candidates.
    Updated when recruiters take actions (hire, reject, shortlist).
    Used to improve ranking and evidence generation.
    """

    __tablename__ = "role_success_patterns"

    id = Column(String, primary_key=True, default=generate_uuid)

    # what role type this pattern applies to (normalized from job titles)
    role_type = Column(String, nullable=False, unique=True, index=True)

    # learned positive signals from hired/shortlisted candidates
    successful_skills = Column(JSON, default=list)  # ["Swift", "SwiftUI", "CoreML"]
    successful_signals = Column(
        JSON, default=list
    )  # ["shipped_apps", "oss_contributor", "high_dev_score"]
    successful_languages = Column(JSON, default=list)  # ["swift", "python"]

    # learned negative signals from rejected candidates
    rejection_patterns = Column(
        JSON, default=list
    )  # ["influencer", "high_follower_low_code", "no_repos"]

    # aggregated profile of successful candidates
    avg_dev_score = Column(Float, nullable=True)
    avg_repo_count = Column(Float, nullable=True)
    avg_followers = Column(Float, nullable=True)
    preferred_candidate_types = Column(JSON, default=list)  # ["developer"]

    # confidence metrics
    hire_count = Column(Integer, default=0)
    shortlist_count = Column(Integer, default=0)
    reject_count = Column(Integer, default=0)
    total_actions = Column(Integer, default=0)
    confidence = Column(Float, default=0.0)  # 0-1, increases with more data

    # which jobs contributed to this pattern
    source_job_ids = Column(JSON, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)
