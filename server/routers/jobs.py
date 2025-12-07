from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
import json
import re

from database import get_db, Job, JobCandidate, Candidate, RecruiterAction, CandidateStatus, EvidenceFeedback
from models import (
    JobCreate, JobUpdate, JobResponse, 
    JobCandidateCreate, JobCandidateUpdate, JobCandidateResponse,
    SourceRequest, GitHubSourceRequest, CandidateResponse,
    RecruiterActionCreate, RecruiterActionResponse,
    EvidenceFeedbackCreate, EvidenceFeedbackResponse
)
from tasks.celery_tasks import source_candidates_task, enrich_job_candidates_task, calculate_scores_task, source_from_usernames_task, source_from_github_task, generate_evidence_cards_task
from services.embedding import generate_job_embedding, calculate_match_scores
from services.grok_api import grok_client

router = APIRouter()


class SeedSourceRequest(BaseModel):
    """Request to source candidates from specific usernames."""
    usernames: List[str] = Field(..., description="List of X usernames to source (without @)")
    skip_classification: bool = Field(default=False, description="Skip Grok classification (trust the seed list)")


class GenerateJobRequest(BaseModel):
    """Request to generate job details from a title."""
    title: str = Field(..., description="Job title to generate details for")


class GenerateJobResponse(BaseModel):
    """Response with generated job details."""
    title: str
    description: str
    keywords: List[str]
    requirements: str


@router.post("/generate", response_model=GenerateJobResponse)
async def generate_job_details(request: GenerateJobRequest):
    """
    Generate job description, keywords, and requirements from a job title using Grok AI.
    """
    prompt = f"""Generate comprehensive job posting details for the following job title: "{request.title}"

Please provide:
1. A compelling job description (2-3 paragraphs)
2. Relevant technical keywords/skills to search for candidates (8-12 keywords)
3. Detailed requirements for the ideal candidate

Respond with JSON only:
{{
    "description": "The job description...",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "requirements": "The detailed requirements..."
}}"""

    messages = [
        {"role": "system", "content": "You are a professional technical recruiter who writes compelling job postings. Generate realistic and detailed job descriptions that would attract top talent. Focus on technical skills, responsibilities, and what makes this role exciting."},
        {"role": "user", "content": prompt}
    ]
    
    response = await grok_client.chat_completion(messages)
    
    if not response:
        raise HTTPException(status_code=500, detail="Failed to generate job details")
    
    try:
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            parsed = json.loads(json_match.group())
            return GenerateJobResponse(
                title=request.title,
                description=parsed.get("description", ""),
                keywords=parsed.get("keywords", []),
                requirements=parsed.get("requirements", "")
            )
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    
    raise HTTPException(status_code=500, detail="Failed to generate job details")


@router.post("", response_model=JobResponse)
async def create_job(job: JobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_job = Job(
        title=job.title,
        description=job.description,
        keywords=job.keywords,
        requirements=job.requirements
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    if job.requirements:
        background_tasks.add_task(generate_job_embedding, db_job.id)
    
    return db_job


@router.get("", response_model=List[JobResponse])
async def list_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    jobs = db.query(Job).offset(skip).limit(limit).all()
    return jobs


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job_update: JobUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = job_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    
    db.commit()
    db.refresh(job)
    
    if "requirements" in update_data and job.requirements:
        background_tasks.add_task(generate_job_embedding, job.id)
        background_tasks.add_task(calculate_match_scores, job.id)
    
    return job


@router.delete("/{job_id}")
async def delete_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    db.delete(job)
    db.commit()
    return {"message": "Job deleted successfully"}


@router.post("/{job_id}/source")
async def trigger_sourcing(job_id: str, request: SourceRequest, db: Session = Depends(get_db)):
    """
    Trigger smart candidate sourcing with:
    - AI-generated search queries
    - Deep tweet analysis to filter real developers
    - Region filtering (optional)
    - Custom search queries (optional)
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job.keywords and not request.search_queries:
        raise HTTPException(status_code=400, detail="Job has no keywords and no custom queries provided")
    
    task = source_candidates_task.delay(
        job_id, 
        request.max_results,
        request.regions,
        request.search_queries,
        request.exclude_influencers,
        request.min_tweets_analyzed,
        request.use_full_archive
    )
    
    return {
        "message": f"Smart sourcing started for job {job_id}", 
        "max_results": request.max_results,
        "regions": request.regions,
        "exclude_influencers": request.exclude_influencers,
        "task_id": task.id
    }


@router.post("/{job_id}/calculate-scores")
async def trigger_score_calculation(job_id: str, db: Session = Depends(get_db)):
    """Manually trigger match score calculation for all candidates in a job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job.requirements:
        raise HTTPException(status_code=400, detail="Job has no requirements for scoring")
    
    task = calculate_scores_task.delay(job_id)
    
    return {"message": f"Score calculation started for job {job_id}", "task_id": task.id}


@router.post("/{job_id}/enrich")
async def trigger_enrichment(job_id: str, db: Session = Depends(get_db)):
    """Manually trigger enrichment for all candidates in a job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    task = enrich_job_candidates_task.delay(job_id)
    
    return {"message": f"Enrichment started for job {job_id}", "task_id": task.id}


@router.post("/{job_id}/source-usernames")
async def source_from_seed_list(job_id: str, request: SeedSourceRequest, db: Session = Depends(get_db)):
    """
    Source candidates from a specific list of usernames.
    Use this when you have a known list of developer accounts to add.
    
    Example iOS dev accounts: twostraws, seanallen_dev, sarunw, _Kavsoft, philipcdavis
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not request.usernames:
        raise HTTPException(status_code=400, detail="No usernames provided")
    
    # Clean usernames (remove @ if present)
    clean_usernames = [u.lstrip("@").strip() for u in request.usernames if u.strip()]
    
    task = source_from_usernames_task.delay(
        job_id,
        clean_usernames,
        request.skip_classification
    )
    
    return {
        "message": f"Sourcing {len(clean_usernames)} usernames for job {job_id}",
        "usernames": clean_usernames,
        "task_id": task.id
    }


@router.post("/{job_id}/source-github")
async def source_from_github(job_id: str, request: GitHubSourceRequest, db: Session = Depends(get_db)):
    """
    Source candidates from GitHub, then enrich with X/Twitter profiles if available.
    
    This approach:
    1. Searches GitHub for developers matching your criteria
    2. Analyzes their repos, languages, and contribution history
    3. If they have an X/Twitter profile linked, fetches and analyzes their tweets
    4. Creates candidates with combined GitHub + X data
    
    Best for finding verified developers with actual code to review.
    
    Example queries:
    - "machine learning engineer" with language="python"
    - "iOS developer" with language="swift" and location="San Francisco"
    - "fullstack" with min_repos=10
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    task = source_from_github_task.delay(
        job_id,
        request.search_query,
        request.language,
        request.location,
        request.min_followers,
        request.min_repos,
        request.max_results,
        request.require_x_profile,
        request.min_dev_score
    )
    
    return {
        "message": f"GitHub sourcing started for job {job_id}",
        "search_query": request.search_query,
        "language": request.language,
        "location": request.location,
        "max_results": request.max_results,
        "require_x_profile": request.require_x_profile,
        "task_id": task.id
    }


@router.get("/{job_id}/candidates", response_model=List[JobCandidateResponse])
async def get_job_candidates(
    job_id: str, 
    top_k: int = 50,
    sort_by: str = "match_score",
    db: Session = Depends(get_db)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    query = db.query(JobCandidate).filter(JobCandidate.job_id == job_id)
    
    if sort_by == "match_score":
        query = query.order_by(JobCandidate.match_score.desc().nullslast())
    elif sort_by == "added_at":
        query = query.order_by(JobCandidate.added_at.desc())
    
    job_candidates = query.limit(top_k).all()
    
    result = []
    for jc in job_candidates:
        jc_dict = {
            "id": jc.id,
            "job_id": jc.job_id,
            "candidate_id": jc.candidate_id,
            "status": jc.status,
            "interview_stage": jc.interview_stage,
            "notes": jc.notes,
            "match_score": jc.match_score,
            "evidence": jc.evidence,
            "added_at": jc.added_at,
            "updated_at": jc.updated_at,
            "candidate": jc.candidate
        }
        result.append(jc_dict)
    
    return result


@router.post("/{job_id}/candidates/{candidate_id}", response_model=JobCandidateResponse)
async def add_candidate_to_job(
    job_id: str, 
    candidate_id: str, 
    data: JobCandidateCreate,
    db: Session = Depends(get_db)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    existing = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate already added to this job")
    
    job_candidate = JobCandidate(
        job_id=job_id,
        candidate_id=candidate_id,
        status=data.status,
        interview_stage=data.interview_stage,
        notes=data.notes
    )
    db.add(job_candidate)
    db.commit()
    db.refresh(job_candidate)
    
    calculate_scores_task.delay(job_id, candidate_id)
    
    return job_candidate


@router.put("/{job_id}/candidates/{candidate_id}", response_model=JobCandidateResponse)
async def update_job_candidate(
    job_id: str, 
    candidate_id: str, 
    data: JobCandidateUpdate,
    db: Session = Depends(get_db)
):
    job_candidate = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    
    if not job_candidate:
        raise HTTPException(status_code=404, detail="Job-candidate relationship not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job_candidate, field, value)
    
    db.commit()
    db.refresh(job_candidate)
    return job_candidate


@router.delete("/{job_id}/candidates/{candidate_id}")
async def remove_candidate_from_job(job_id: str, candidate_id: str, db: Session = Depends(get_db)):
    job_candidate = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    
    if not job_candidate:
        raise HTTPException(status_code=404, detail="Job-candidate relationship not found")
    
    db.delete(job_candidate)
    db.commit()
    return {"message": "Candidate removed from job"}


@router.post("/{job_id}/candidates/{candidate_id}/action", response_model=RecruiterActionResponse)
async def track_recruiter_action(
    job_id: str,
    candidate_id: str,
    action: RecruiterActionCreate,
    db: Session = Depends(get_db)
):
    """
    Track recruiter actions for self-improving ranking.
    Actions: view, shortlist, contact, reject, hire
    Also updates the candidate status in the job pipeline.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Update the JobCandidate status based on the action
    job_candidate = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    
    if job_candidate:
        action_to_status = {
            "shortlist": CandidateStatus.SHORTLISTED,
            "contact": CandidateStatus.INTERVIEWING,
            "reject": CandidateStatus.REJECTED,
            "hire": CandidateStatus.HIRED,
        }
        if action.action in action_to_status:
            job_candidate.status = action_to_status[action.action]
    
    recruiter_action = RecruiterAction(
        job_id=job_id,
        candidate_id=candidate_id,
        action=action.action,
        time_spent_seconds=action.time_spent_seconds
    )
    db.add(recruiter_action)
    db.commit()
    db.refresh(recruiter_action)
    
    return recruiter_action


@router.get("/{job_id}/ranking-weights")
async def get_ranking_weights(job_id: str, db: Session = Depends(get_db)):
    """
    Get learned ranking weights for a job based on recruiter actions.
    Returns signal weights that can be used to re-rank candidates.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Get all actions for this job
    actions = db.query(RecruiterAction).filter(RecruiterAction.job_id == job_id).all()
    
    if not actions:
        return {
            "job_id": job_id,
            "total_actions": 0,
            "weights": {
                "github_stars": 1.0,
                "github_repos": 1.0,
                "followers": 1.0,
                "dev_score": 1.0,
                "has_x_profile": 1.0
            },
            "message": "No actions yet - using default weights"
        }
    
    # Count positive vs negative actions per candidate
    positive_actions = {"shortlist", "contact", "hire"}
    negative_actions = {"reject"}
    
    candidate_signals = {}
    for action in actions:
        cid = action.candidate_id
        if cid not in candidate_signals:
            candidate_signals[cid] = {"positive": 0, "negative": 0, "views": 0}
        
        if action.action in positive_actions:
            candidate_signals[cid]["positive"] += 1
        elif action.action in negative_actions:
            candidate_signals[cid]["negative"] += 1
        elif action.action == "view":
            candidate_signals[cid]["views"] += 1
    
    # Get candidate features for signal analysis
    positive_candidates = [cid for cid, s in candidate_signals.items() if s["positive"] > 0]
    negative_candidates = [cid for cid, s in candidate_signals.items() if s["negative"] > 0 and s["positive"] == 0]
    
    # Calculate average features for positive vs negative candidates
    # This is a simplified version - production would use proper ML
    
    return {
        "job_id": job_id,
        "total_actions": len(actions),
        "positive_candidates": len(positive_candidates),
        "negative_candidates": len(negative_candidates),
        "weights": {
            "github_stars": 1.0,
            "github_repos": 1.0,
            "followers": 1.0,
            "dev_score": 1.2 if len(positive_candidates) > 0 else 1.0,
            "has_x_profile": 1.0
        },
        "message": "Weights adjusted based on recruiter actions"
    }


@router.post("/{job_id}/generate-evidence")
async def generate_evidence(job_id: str, db: Session = Depends(get_db)):
    """
    Generate evidence cards for all candidates in a job.
    This explains WHY each candidate matches the role.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Count candidates needing evidence
    candidates_needing_evidence = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.evidence.is_(None)
    ).count()
    
    task = generate_evidence_cards_task.delay(job_id)
    
    return {
        "message": f"Evidence generation started for job {job_id}",
        "candidates_to_process": candidates_needing_evidence,
        "task_id": task.id
    }


# ==================== Evidence Feedback ====================

@router.post("/{job_id}/candidates/{candidate_id}/evidence-feedback", response_model=EvidenceFeedbackResponse)
async def submit_evidence_feedback(
    job_id: str,
    candidate_id: str,
    feedback: EvidenceFeedbackCreate,
    db: Session = Depends(get_db)
):
    """
    Submit feedback on an evidence card (thumbs up/down).
    This feedback is used to improve future evidence generation.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_candidate = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    
    if not job_candidate:
        raise HTTPException(status_code=404, detail="Candidate not found in this job")
    
    if feedback.feedback_type not in ["positive", "negative"]:
        raise HTTPException(status_code=400, detail="feedback_type must be 'positive' or 'negative'")
    
    # store snapshot of evidence at feedback time
    evidence_snapshot = job_candidate.evidence
    
    feedback_record = EvidenceFeedback(
        job_id=job_id,
        candidate_id=candidate_id,
        feedback_type=feedback.feedback_type,
        feedback_target=feedback.feedback_target,
        comment=feedback.comment,
        evidence_snapshot=evidence_snapshot
    )
    
    db.add(feedback_record)
    db.commit()
    db.refresh(feedback_record)
    
    return feedback_record


@router.get("/{job_id}/evidence-feedback", response_model=List[EvidenceFeedbackResponse])
async def get_job_evidence_feedback(
    job_id: str,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all evidence feedback for a job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    feedback_list = db.query(EvidenceFeedback).filter(
        EvidenceFeedback.job_id == job_id
    ).order_by(EvidenceFeedback.created_at.desc()).limit(limit).all()
    
    return feedback_list


@router.post("/{job_id}/candidates/{candidate_id}/regenerate-evidence")
async def regenerate_evidence_with_feedback(
    job_id: str,
    candidate_id: str,
    db: Session = Depends(get_db)
):
    """
    Regenerate evidence for a specific candidate using accumulated feedback.
    This uses the feedback history to improve the evidence generation.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_candidate = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.candidate_id == candidate_id
    ).first()
    
    if not job_candidate:
        raise HTTPException(status_code=404, detail="Candidate not found in this job")
    
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    
    # get feedback history for this job to learn from
    feedback_history = db.query(EvidenceFeedback).filter(
        EvidenceFeedback.job_id == job_id
    ).order_by(EvidenceFeedback.created_at.desc()).limit(20).all()
    
    # format feedback for grok
    feedback_examples = []
    for fb in feedback_history:
        if fb.evidence_snapshot:
            feedback_examples.append({
                "feedback_type": fb.feedback_type,
                "feedback_target": fb.feedback_target,
                "comment": fb.comment,
                "evidence": fb.evidence_snapshot
            })
    
    # generate new evidence with feedback context
    from services.grok_api import grok_client
    
    job_data = {
        "title": job.title,
        "keywords": job.keywords or [],
        "requirements": job.requirements or ""
    }
    
    candidate_data = {
        "bio": candidate.bio,
        "skills_extracted": candidate.skills_extracted or [],
        "raw_tweets": candidate.raw_tweets or [],
        "tweet_analysis": candidate.tweet_analysis or {}
    }
    
    new_evidence = await grok_client.generate_evidence_card_with_feedback(
        candidate_data,
        job_data,
        feedback_examples
    )
    
    # update the job candidate with new evidence
    job_candidate.evidence = new_evidence
    db.commit()
    
    return {
        "message": "Evidence regenerated with feedback",
        "job_id": job_id,
        "candidate_id": candidate_id,
        "feedback_used": len(feedback_examples),
        "evidence": new_evidence
    }

