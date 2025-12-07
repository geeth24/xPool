from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional

from database import get_db, Candidate, JobCandidate, Job, CandidateType, CandidateVerification
from models import (
    CandidateCreate, CandidateUpdate, CandidateResponse,
    CandidateSearchRequest, CandidateSearchResponse,
    InterviewStage, CandidateStatus,
    CandidateType as CandidateTypeModel,
    VerificationRequest, VerificationResponse
)
from services.embedding import find_similar_candidates, generate_candidate_embedding
from services.sourcing import enrich_single_candidate
from tasks.celery_tasks import reclassify_candidate_task

router = APIRouter()


@router.get("", response_model=List[CandidateResponse])
async def list_candidates(
    skip: int = 0, 
    limit: int = 100,
    has_embedding: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List all candidates with optional filters."""
    query = db.query(Candidate)
    
    if has_embedding is True:
        query = query.filter(Candidate.embedding.isnot(None))
    elif has_embedding is False:
        query = query.filter(Candidate.embedding.is_(None))
    
    candidates = query.offset(skip).limit(limit).all()
    return candidates


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(candidate_id: str, db: Session = Depends(get_db)):
    """Get a specific candidate by ID."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.put("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: str, 
    data: CandidateUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Update a candidate's information."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(candidate, field, value)
    
    db.commit()
    db.refresh(candidate)
    
    background_tasks.add_task(generate_candidate_embedding, candidate_id)
    
    return candidate


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: str, db: Session = Depends(get_db)):
    """Delete a candidate."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    db.delete(candidate)
    db.commit()
    return {"message": "Candidate deleted successfully"}


@router.post("/{candidate_id}/enrich")
async def enrich_candidate(
    candidate_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Trigger Grok analysis for a candidate."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    background_tasks.add_task(enrich_single_candidate, candidate_id)
    
    return {"message": f"Enrichment started for candidate {candidate.x_username}"}


@router.post("/{candidate_id}/reclassify")
async def reclassify_candidate(candidate_id: str, db: Session = Depends(get_db)):
    """
    Re-analyze a candidate's tweets to update their classification.
    Useful if initial classification was wrong or tweets have changed.
    """
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    task = reclassify_candidate_task.delay(candidate_id)
    
    return {
        "message": f"Reclassification started for @{candidate.x_username}",
        "task_id": task.id
    }


@router.get("/by-type/{candidate_type}", response_model=List[CandidateResponse])
async def get_candidates_by_type(
    candidate_type: str,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get candidates filtered by their classification type."""
    try:
        type_enum = CandidateType(candidate_type)
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid candidate type. Must be one of: {[t.value for t in CandidateType]}"
        )
    
    candidates = db.query(Candidate).filter(
        Candidate.candidate_type == type_enum
    ).offset(skip).limit(limit).all()
    
    return candidates


@router.post("/upload-to-collection")
async def upload_all_to_collection(db: Session = Depends(get_db)):
    """Upload all candidates to xAI Collection for semantic search."""
    from services.embedding import collections_service
    
    candidates = db.query(Candidate).all()
    uploaded = 0
    errors = 0
    
    for candidate in candidates:
        try:
            doc_id = await collections_service.upload_candidate_document(candidate.id)
            if doc_id:
                uploaded += 1
            else:
                errors += 1
        except Exception as e:
            print(f"Error uploading {candidate.x_username}: {e}")
            errors += 1
    
    return {
        "message": f"Upload complete",
        "uploaded": uploaded,
        "errors": errors,
        "total": len(candidates)
    }


@router.get("/{candidate_id}/similar")
async def find_similar_to_candidate(
    candidate_id: str,
    top_k: int = 10,
    job_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Find candidates similar to a given candidate using semantic search.
    Uses xAI Collections to find semantically similar profiles.
    
    - candidate_id: The candidate to find similar profiles for
    - top_k: Number of similar candidates to return
    - job_id: Optional - limit to candidates in a specific job
    """
    from services.embedding import collections_service
    
    # Get the source candidate
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Build a query from the candidate's profile
    query_parts = []
    if candidate.bio:
        query_parts.append(candidate.bio)
    if candidate.skills_extracted:
        query_parts.append(" ".join(candidate.skills_extracted[:10]))
    if candidate.grok_summary:
        query_parts.append(candidate.grok_summary)
    
    if not query_parts:
        raise HTTPException(status_code=400, detail="Candidate has no profile data for similarity search")
    
    query_text = " ".join(query_parts)
    
    # Search the collection
    results = await collections_service.search_candidates(query_text, top_k=top_k + 5)  # get extra to filter
    
    # Filter out the source candidate and optionally filter by job
    # Dedupe results since collection may have multiple chunks per candidate
    similar_candidates = []
    seen_ids = set()
    seen_ids.add(candidate_id)  # exclude source candidate
    
    for cid, score in results:
        if cid in seen_ids:
            continue
        seen_ids.add(cid)
        
        if job_id:
            # Check if candidate is in the specified job
            jc = db.query(JobCandidate).filter(
                JobCandidate.candidate_id == cid,
                JobCandidate.job_id == job_id
            ).first()
            if not jc:
                continue
        
        c = db.query(Candidate).filter(Candidate.id == cid).first()
        if c:
            similar_candidates.append({
                "id": c.id,
                "display_name": c.display_name,
                "github_username": c.github_username,
                "x_username": c.x_username,
                "bio": c.bio,
                "skills_extracted": c.skills_extracted,
                "location": c.location,
                "similarity_score": round(score * 100, 1),
                "github_url": c.github_url,
                "profile_url": c.profile_url
            })
        
        if len(similar_candidates) >= top_k:
            break
    
    return {
        "source_candidate": {
            "id": candidate.id,
            "display_name": candidate.display_name,
            "github_username": candidate.github_username
        },
        "similar_candidates": similar_candidates,
        "total_found": len(similar_candidates)
    }


@router.post("/semantic-search")
async def semantic_search_candidates(
    query: str,
    top_k: int = 20,
    job_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Search candidates using natural language semantic search.
    Uses xAI Collections to find candidates matching the query.
    
    Examples:
    - "Python developers with machine learning experience"
    - "iOS engineers who have worked on SwiftUI"
    - "Backend developers familiar with Kubernetes"
    """
    from services.embedding import collections_service
    
    if not query or len(query.strip()) < 3:
        raise HTTPException(status_code=400, detail="Query must be at least 3 characters")
    
    # Search the collection - request extra results to account for stale/duplicate IDs
    results = await collections_service.search_candidates(query.strip(), top_k=top_k * 4)
    
    if not results:
        return {
            "query": query,
            "candidates": [],
            "total_found": 0,
            "message": "No candidates found. Try uploading candidates to the collection first."
        }
    
    # Fetch full candidate data and optionally filter by job
    # Note: collection may have stale IDs from previous uploads, so we skip non-existent candidates
    candidates = []
    seen_ids = set()  # dedupe results
    
    for cid, score in results:
        if cid in seen_ids:
            continue
        seen_ids.add(cid)
        
        if job_id:
            # Check if candidate is in the specified job
            jc = db.query(JobCandidate).filter(
                JobCandidate.candidate_id == cid,
                JobCandidate.job_id == job_id
            ).first()
            if not jc:
                continue
        
        c = db.query(Candidate).filter(Candidate.id == cid).first()
        if c:
            candidates.append({
                "id": c.id,
                "display_name": c.display_name,
                "github_username": c.github_username,
                "x_username": c.x_username,
                "bio": c.bio,
                "skills_extracted": c.skills_extracted,
                "location": c.location,
                "relevance_score": round(score * 100, 1),
                "github_url": c.github_url,
                "profile_url": c.profile_url,
                "grok_summary": c.grok_summary
            })
        
        if len(candidates) >= top_k:
            break
    
    return {
        "query": query,
        "candidates": candidates,
        "total_found": len(candidates),
        "job_filter": job_id
    }


@router.post("/search", response_model=CandidateSearchResponse)
async def search_candidates(request: CandidateSearchRequest, db: Session = Depends(get_db)):
    """
    Hybrid search combining SQLite filters with semantic similarity.
    
    1. Apply hard filters (interview stage, status, metrics)
    2. If query provided, rank by semantic similarity
    3. Apply sorting and return top-K
    """
    query = db.query(Candidate)
    filters = request.filters
    
    if filters:
        if filters.job_id:
            candidate_ids_in_job = db.query(JobCandidate.candidate_id).filter(
                JobCandidate.job_id == filters.job_id
            )
            
            if filters.interview_stage:
                candidate_ids_in_job = candidate_ids_in_job.filter(
                    JobCandidate.interview_stage.in_(filters.interview_stage)
                )
            
            if filters.status:
                candidate_ids_in_job = candidate_ids_in_job.filter(
                    JobCandidate.status.in_(filters.status)
                )
            
            query = query.filter(Candidate.id.in_(candidate_ids_in_job))
        
        if filters.min_codeforces_rating:
            query = query.filter(Candidate.codeforces_rating >= filters.min_codeforces_rating)
        
        if filters.max_codeforces_rating:
            query = query.filter(Candidate.codeforces_rating <= filters.max_codeforces_rating)
        
        if filters.min_followers:
            query = query.filter(Candidate.followers_count >= filters.min_followers)
        
        if filters.min_years_experience:
            query = query.filter(Candidate.years_experience >= filters.min_years_experience)
        
        if filters.skills:
            for skill in filters.skills:
                query = query.filter(
                    Candidate.skills_extracted.contains(skill)
                )
    
    filtered_candidates = query.all()
    total = len(filtered_candidates)
    
    if request.query and request.query.strip():
        candidate_ids = [c.id for c in filtered_candidates]
        
        if candidate_ids:
            similarities = await find_similar_candidates(
                request.query,
                candidate_ids=candidate_ids,
                top_k=request.top_k
            )
            
            similarity_map = {cid: score for cid, score in similarities}
            
            sorted_candidates = sorted(
                filtered_candidates,
                key=lambda c: similarity_map.get(c.id, 0),
                reverse=True
            )[:request.top_k]
            
            return CandidateSearchResponse(
                candidates=sorted_candidates,
                total=total,
                query=request.query
            )
    
    if request.sort_by:
        reverse = request.sort_order == "desc"
        
        if request.sort_by == "codeforces_rating":
            filtered_candidates.sort(
                key=lambda c: c.codeforces_rating or 0,
                reverse=reverse
            )
        elif request.sort_by == "followers_count":
            filtered_candidates.sort(
                key=lambda c: c.followers_count or 0,
                reverse=reverse
            )
        elif request.sort_by == "years_experience":
            filtered_candidates.sort(
                key=lambda c: c.years_experience or 0,
                reverse=reverse
            )
        elif request.sort_by == "sourced_at":
            filtered_candidates.sort(
                key=lambda c: c.sourced_at,
                reverse=reverse
            )
    
    result_candidates = filtered_candidates[:request.top_k]
    
    return CandidateSearchResponse(
        candidates=result_candidates,
        total=total,
        query=request.query
    )


@router.get("/by-job/{job_id}/not-reached-out", response_model=List[CandidateResponse])
async def get_candidates_not_reached_out(
    job_id: str,
    top_k: int = 20,
    db: Session = Depends(get_db)
):
    """Get candidates for a job that haven't been reached out to yet, sorted by match score."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_candidates = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id,
        JobCandidate.interview_stage == InterviewStage.NOT_REACHED_OUT
    ).order_by(
        JobCandidate.match_score.desc().nullslast()
    ).limit(top_k).all()
    
    return [jc.candidate for jc in job_candidates]


@router.get("/by-job/{job_id}/top", response_model=List[CandidateResponse])
async def get_top_candidates_for_job(
    job_id: str,
    top_k: int = 10,
    min_score: float = 0,
    db: Session = Depends(get_db)
):
    """Get top-K candidates for a job by match score."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    query = db.query(JobCandidate).filter(
        JobCandidate.job_id == job_id
    )
    
    if min_score > 0:
        query = query.filter(JobCandidate.match_score >= min_score)
    
    job_candidates = query.order_by(
        JobCandidate.match_score.desc().nullslast()
    ).limit(top_k).all()
    
    return [jc.candidate for jc in job_candidates]


# ==================== Verification/Claim Flow ====================

@router.get("/{candidate_id}/verification", response_model=VerificationResponse)
async def get_verification_status(candidate_id: str, db: Session = Depends(get_db)):
    """Get verification status for a candidate."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    verification = db.query(CandidateVerification).filter(
        CandidateVerification.candidate_id == candidate_id
    ).first()
    
    if not verification:
        return VerificationResponse(
            candidate_id=candidate_id,
            is_verified=0,
            verification_method=None,
            proofs=[],
            email=None,
            preferred_contact=None,
            open_to_opportunities=1,
            verified_at=None
        )
    
    return VerificationResponse(
        candidate_id=candidate_id,
        is_verified=verification.is_verified,
        verification_method=verification.verification_method,
        proofs=verification.proofs or [],
        email=verification.email,
        preferred_contact=verification.preferred_contact,
        open_to_opportunities=verification.open_to_opportunities,
        verified_at=verification.verified_at
    )


@router.post("/{candidate_id}/claim")
async def claim_profile(
    candidate_id: str,
    request: VerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Allow a candidate to claim their profile.
    "We found your public handle; click to confirm and add 1-2 canonical proofs."
    """
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Check if already verified
    existing = db.query(CandidateVerification).filter(
        CandidateVerification.candidate_id == candidate_id
    ).first()
    
    if existing and existing.is_verified == 2:
        raise HTTPException(status_code=400, detail="Profile already verified")
    
    # Convert proofs to dict
    proofs_dict = [p.model_dump() for p in request.proofs]
    
    if existing:
        existing.verification_method = request.verification_method
        existing.email = request.email
        existing.proofs = proofs_dict
        existing.preferred_contact = request.preferred_contact
        existing.open_to_opportunities = request.open_to_opportunities
        existing.is_verified = 1  # pending
    else:
        verification = CandidateVerification(
            candidate_id=candidate_id,
            verification_method=request.verification_method,
            email=request.email,
            proofs=proofs_dict,
            preferred_contact=request.preferred_contact,
            open_to_opportunities=request.open_to_opportunities,
            is_verified=1  # pending
        )
        db.add(verification)
    
    db.commit()
    
    return {
        "message": "Profile claim submitted",
        "candidate_id": candidate_id,
        "status": "pending",
        "proofs_count": len(proofs_dict)
    }


@router.post("/{candidate_id}/verify")
async def verify_profile(
    candidate_id: str,
    db: Session = Depends(get_db)
):
    """Admin endpoint to verify a claimed profile."""
    from datetime import datetime
    
    verification = db.query(CandidateVerification).filter(
        CandidateVerification.candidate_id == candidate_id
    ).first()
    
    if not verification:
        raise HTTPException(status_code=404, detail="No claim found for this candidate")
    
    verification.is_verified = 2
    verification.verified_at = datetime.utcnow()
    db.commit()
    
    return {
        "message": "Profile verified",
        "candidate_id": candidate_id,
        "verified_at": verification.verified_at
    }


@router.get("/verified", response_model=List[CandidateResponse])
async def get_verified_candidates(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get all verified candidates."""
    verified_ids = db.query(CandidateVerification.candidate_id).filter(
        CandidateVerification.is_verified == 2
    ).all()
    
    candidate_ids = [v[0] for v in verified_ids]
    
    candidates = db.query(Candidate).filter(
        Candidate.id.in_(candidate_ids)
    ).offset(skip).limit(limit).all()
    
    return candidates

