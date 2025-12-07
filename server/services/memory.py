"""
MemOS-style Memory Service

Handles learning from recruiter actions to improve candidate ranking and evidence generation.
This is the "self-improving" component that updates based on feedback.
"""

from typing import Dict, List, Optional, Tuple
from collections import Counter
import re

from database import (
    SessionLocal, 
    RoleSuccessPattern, 
    RecruiterAction, 
    Candidate, 
    Job,
    JobCandidate,
    CandidateType
)


def normalize_role_type(job_title: str) -> str:
    """
    Normalize job title to a role type for pattern matching.
    e.g., "Senior iOS Engineer" -> "ios_engineer"
    """
    title = job_title.lower().strip()
    
    # remove seniority prefixes
    for prefix in ["senior", "junior", "lead", "principal", "staff", "sr.", "jr."]:
        title = title.replace(prefix, "").strip()
    
    # common role mappings
    role_mappings = {
        "ios": "ios_engineer",
        "swift": "ios_engineer",
        "android": "android_engineer",
        "kotlin": "android_engineer",
        "frontend": "frontend_engineer",
        "front-end": "frontend_engineer",
        "react": "frontend_engineer",
        "backend": "backend_engineer",
        "back-end": "backend_engineer",
        "fullstack": "fullstack_engineer",
        "full-stack": "fullstack_engineer",
        "full stack": "fullstack_engineer",
        "machine learning": "ml_engineer",
        "ml ": "ml_engineer",
        "data scientist": "data_scientist",
        "data science": "data_scientist",
        "devops": "devops_engineer",
        "sre": "sre_engineer",
        "platform": "platform_engineer",
        "infrastructure": "infra_engineer",
        "python": "python_engineer",
        "golang": "go_engineer",
        "rust": "rust_engineer",
    }
    
    for keyword, role_type in role_mappings.items():
        if keyword in title:
            return role_type
    
    # fallback: clean and snake_case the title
    cleaned = re.sub(r'[^a-z0-9\s]', '', title)
    return "_".join(cleaned.split())[:50] or "general_engineer"


def get_or_create_pattern(db, role_type: str) -> RoleSuccessPattern:
    """Get existing pattern or create new one for a role type."""
    pattern = db.query(RoleSuccessPattern).filter(
        RoleSuccessPattern.role_type == role_type
    ).first()
    
    if not pattern:
        pattern = RoleSuccessPattern(role_type=role_type)
        db.add(pattern)
        db.flush()
    
    return pattern


def extract_candidate_signals(candidate: Candidate) -> Dict:
    """Extract learnable signals from a candidate profile."""
    signals = {
        "skills": candidate.skills_extracted or [],
        "languages": [],
        "candidate_type": candidate.candidate_type.value if candidate.candidate_type else "unknown",
        "dev_score": None,
        "repo_count": candidate.github_repos_count,
        "followers": candidate.followers_count,
        "has_github": bool(candidate.github_url or candidate.github_username),
        "has_x": bool(candidate.x_username),
        "signals": []
    }
    
    # extract from tweet_analysis if available
    tweet_analysis = candidate.tweet_analysis or {}
    github_profile = tweet_analysis.get("github_profile", {}) or {}
    
    if github_profile:
        signals["dev_score"] = github_profile.get("developer_score")
        signals["languages"] = list((github_profile.get("languages", {}) or {}).keys())
        signals["repo_count"] = signals["repo_count"] or len(github_profile.get("top_repos", []))
    
    # derive signals
    if signals["dev_score"] and signals["dev_score"] >= 70:
        signals["signals"].append("high_dev_score")
    if signals["repo_count"] and signals["repo_count"] >= 10:
        signals["signals"].append("many_repos")
    if signals["has_github"] and signals["has_x"]:
        signals["signals"].append("multi_platform_presence")
    if candidate.candidate_type == CandidateType.DEVELOPER:
        signals["signals"].append("verified_developer")
    if candidate.candidate_type == CandidateType.INFLUENCER:
        signals["signals"].append("influencer")
    if signals["followers"] and signals["followers"] > 1000 and (not signals["repo_count"] or signals["repo_count"] < 5):
        signals["signals"].append("high_follower_low_code")
    
    # check for specific achievements in tweet analysis
    x_classification = tweet_analysis.get("x_classification", {}) or {}
    if x_classification.get("is_actively_coding"):
        signals["signals"].append("actively_coding")
    green_flags = x_classification.get("green_flags", []) or []
    for flag in green_flags:
        if "ship" in flag.lower() or "launch" in flag.lower():
            signals["signals"].append("ships_products")
            break
    
    return signals


async def update_pattern_from_action(
    job_id: str, 
    candidate_id: str, 
    action: str
) -> Optional[RoleSuccessPattern]:
    """
    Update learned patterns based on a recruiter action.
    Called when recruiter shortlists, hires, or rejects a candidate.
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        
        if not job or not candidate:
            return None
        
        role_type = normalize_role_type(job.title)
        pattern = get_or_create_pattern(db, role_type)
        
        # extract signals from this candidate
        signals = extract_candidate_signals(candidate)
        
        # update pattern based on action type
        if action in ["hire", "shortlist", "contact"]:
            # positive action - learn from this candidate
            _update_positive_signals(pattern, signals, action)
            
            # track job source
            source_jobs = pattern.source_job_ids or []
            if job_id not in source_jobs:
                source_jobs.append(job_id)
                pattern.source_job_ids = source_jobs
            
        elif action == "reject":
            # negative action - learn what to avoid
            _update_negative_signals(pattern, signals)
        
        # update confidence based on sample size
        pattern.total_actions = (pattern.total_actions or 0) + 1
        pattern.confidence = min(1.0, pattern.total_actions / 50)  # max confidence at 50 actions
        
        db.commit()
        db.refresh(pattern)
        
        print(f"[Memory] Updated pattern for {role_type}: confidence={pattern.confidence:.2f}, hires={pattern.hire_count}, rejects={pattern.reject_count}")
        
        return pattern
        
    except Exception as e:
        print(f"[Memory] Error updating pattern: {e}")
        db.rollback()
        return None
    finally:
        db.close()


def _update_positive_signals(pattern: RoleSuccessPattern, signals: Dict, action: str):
    """Update pattern with positive signals from a successful candidate."""
    
    # update counts
    if action == "hire":
        pattern.hire_count = (pattern.hire_count or 0) + 1
    elif action in ["shortlist", "contact"]:
        pattern.shortlist_count = (pattern.shortlist_count or 0) + 1
    
    # aggregate skills (keep top 20)
    current_skills = pattern.successful_skills or []
    new_skills = signals.get("skills", [])
    all_skills = current_skills + new_skills
    skill_counts = Counter(all_skills)
    pattern.successful_skills = [s for s, _ in skill_counts.most_common(20)]
    
    # aggregate languages
    current_langs = pattern.successful_languages or []
    new_langs = signals.get("languages", [])
    all_langs = current_langs + new_langs
    lang_counts = Counter(all_langs)
    pattern.successful_languages = [l for l, _ in lang_counts.most_common(10)]
    
    # aggregate signals
    current_signals = pattern.successful_signals or []
    new_signals = signals.get("signals", [])
    all_signals = current_signals + new_signals
    signal_counts = Counter(all_signals)
    pattern.successful_signals = [s for s, _ in signal_counts.most_common(15)]
    
    # update averages (running average)
    n = (pattern.hire_count or 0) + (pattern.shortlist_count or 0)
    
    if signals.get("dev_score") is not None:
        old_avg = pattern.avg_dev_score or signals["dev_score"]
        pattern.avg_dev_score = ((old_avg * (n - 1)) + signals["dev_score"]) / n
    
    if signals.get("repo_count") is not None:
        old_avg = pattern.avg_repo_count or signals["repo_count"]
        pattern.avg_repo_count = ((old_avg * (n - 1)) + signals["repo_count"]) / n
    
    if signals.get("followers") is not None:
        old_avg = pattern.avg_followers or signals["followers"]
        pattern.avg_followers = ((old_avg * (n - 1)) + signals["followers"]) / n
    
    # track preferred candidate types
    candidate_type = signals.get("candidate_type")
    if candidate_type and candidate_type != "unknown":
        current_types = pattern.preferred_candidate_types or []
        current_types.append(candidate_type)
        type_counts = Counter(current_types)
        pattern.preferred_candidate_types = [t for t, _ in type_counts.most_common(3)]


def _update_negative_signals(pattern: RoleSuccessPattern, signals: Dict):
    """Update pattern with negative signals from a rejected candidate."""
    
    pattern.reject_count = (pattern.reject_count or 0) + 1
    
    # learn rejection patterns
    current_rejections = pattern.rejection_patterns or []
    
    # add candidate type if it's not developer
    candidate_type = signals.get("candidate_type")
    if candidate_type and candidate_type not in ["developer", "unknown"]:
        current_rejections.append(candidate_type)
    
    # add negative signals
    for signal in signals.get("signals", []):
        if signal in ["influencer", "high_follower_low_code"]:
            current_rejections.append(signal)
    
    # if no repos, that's a pattern
    if not signals.get("repo_count") or signals["repo_count"] == 0:
        current_rejections.append("no_repos")
    
    # if no github at all
    if not signals.get("has_github"):
        current_rejections.append("no_github")
    
    # dedupe and keep most common
    rejection_counts = Counter(current_rejections)
    pattern.rejection_patterns = [r for r, _ in rejection_counts.most_common(10)]


def get_pattern_for_job(job_id: str) -> Optional[Dict]:
    """
    Get learned pattern for a job's role type.
    Returns None if no pattern exists or confidence is too low.
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return None
        
        role_type = normalize_role_type(job.title)
        pattern = db.query(RoleSuccessPattern).filter(
            RoleSuccessPattern.role_type == role_type
        ).first()
        
        if not pattern:
            return None
        
        return {
            "role_type": pattern.role_type,
            "successful_skills": pattern.successful_skills or [],
            "successful_signals": pattern.successful_signals or [],
            "successful_languages": pattern.successful_languages or [],
            "rejection_patterns": pattern.rejection_patterns or [],
            "avg_dev_score": pattern.avg_dev_score,
            "avg_repo_count": pattern.avg_repo_count,
            "preferred_candidate_types": pattern.preferred_candidate_types or [],
            "confidence": pattern.confidence or 0,
            "hire_count": pattern.hire_count or 0,
            "shortlist_count": pattern.shortlist_count or 0,
            "reject_count": pattern.reject_count or 0,
            "total_actions": pattern.total_actions or 0
        }
        
    finally:
        db.close()


def get_all_patterns() -> List[Dict]:
    """Get all learned patterns for display."""
    db = SessionLocal()
    try:
        patterns = db.query(RoleSuccessPattern).order_by(
            RoleSuccessPattern.total_actions.desc()
        ).all()
        
        return [
            {
                "role_type": p.role_type,
                "successful_skills": p.successful_skills or [],
                "successful_signals": p.successful_signals or [],
                "rejection_patterns": p.rejection_patterns or [],
                "confidence": p.confidence or 0,
                "hire_count": p.hire_count or 0,
                "shortlist_count": p.shortlist_count or 0,
                "reject_count": p.reject_count or 0,
                "total_actions": p.total_actions or 0,
                "updated_at": str(p.updated_at) if p.updated_at else None
            }
            for p in patterns
        ]
    finally:
        db.close()


def format_pattern_for_prompt(pattern: Dict) -> str:
    """Format a learned pattern for injection into Grok prompts."""
    if not pattern or pattern.get("confidence", 0) < 0.2:
        return ""
    
    lines = [
        f"\n=== LEARNED PREFERENCES FOR {pattern['role_type'].upper().replace('_', ' ')} ROLES ===",
        f"(Based on {pattern['hire_count']} hires, {pattern['shortlist_count']} shortlists, {pattern['reject_count']} rejections)",
        ""
    ]
    
    if pattern.get("successful_skills"):
        lines.append(f"SKILLS THAT LED TO HIRES: {', '.join(pattern['successful_skills'][:10])}")
    
    if pattern.get("successful_signals"):
        lines.append(f"POSITIVE SIGNALS: {', '.join(pattern['successful_signals'][:8])}")
    
    if pattern.get("successful_languages"):
        lines.append(f"PREFERRED LANGUAGES: {', '.join(pattern['successful_languages'][:5])}")
    
    if pattern.get("rejection_patterns"):
        lines.append(f"PATTERNS TO AVOID: {', '.join(pattern['rejection_patterns'][:5])}")
    
    if pattern.get("avg_dev_score"):
        lines.append(f"TYPICAL DEV SCORE OF HIRES: {pattern['avg_dev_score']:.0f}/100")
    
    if pattern.get("preferred_candidate_types"):
        lines.append(f"PREFERRED CANDIDATE TYPES: {', '.join(pattern['preferred_candidate_types'])}")
    
    lines.append("")
    lines.append("USE THESE LEARNED PREFERENCES TO IMPROVE YOUR ANALYSIS.")
    lines.append("Prioritize candidates matching successful patterns, flag those matching rejection patterns.")
    
    return "\n".join(lines)


async def calculate_memory_adjusted_score(
    candidate: Candidate, 
    base_score: float,
    pattern: Optional[Dict]
) -> Tuple[float, List[str]]:
    """
    Adjust a candidate's match score based on learned patterns.
    Returns (adjusted_score, list of reasons for adjustment).
    """
    if not pattern or pattern.get("confidence", 0) < 0.2:
        return base_score, []
    
    adjustments = []
    score = base_score
    
    signals = extract_candidate_signals(candidate)
    
    # positive adjustments
    skill_matches = set(signals.get("skills", [])) & set(pattern.get("successful_skills", []))
    if skill_matches:
        boost = min(len(skill_matches) * 2, 10)
        score += boost
        adjustments.append(f"+{boost} for skills: {', '.join(list(skill_matches)[:3])}")
    
    signal_matches = set(signals.get("signals", [])) & set(pattern.get("successful_signals", []))
    if signal_matches:
        boost = min(len(signal_matches) * 3, 12)
        score += boost
        adjustments.append(f"+{boost} for signals: {', '.join(list(signal_matches)[:3])}")
    
    lang_matches = set(signals.get("languages", [])) & set(pattern.get("successful_languages", []))
    if lang_matches:
        boost = min(len(lang_matches) * 2, 6)
        score += boost
        adjustments.append(f"+{boost} for languages: {', '.join(list(lang_matches)[:3])}")
    
    # check dev score against learned average
    if signals.get("dev_score") and pattern.get("avg_dev_score"):
        if signals["dev_score"] >= pattern["avg_dev_score"]:
            score += 5
            adjustments.append(f"+5 dev score above average ({signals['dev_score']:.0f} >= {pattern['avg_dev_score']:.0f})")
    
    # negative adjustments
    rejection_matches = set(signals.get("signals", [])) & set(pattern.get("rejection_patterns", []))
    if rejection_matches:
        penalty = min(len(rejection_matches) * 5, 15)
        score -= penalty
        adjustments.append(f"-{penalty} for rejection patterns: {', '.join(list(rejection_matches)[:3])}")
    
    candidate_type = signals.get("candidate_type")
    if candidate_type in pattern.get("rejection_patterns", []):
        score -= 10
        adjustments.append(f"-10 candidate type '{candidate_type}' often rejected")
    
    # ensure score stays in bounds
    score = max(0, min(100, score))
    
    return score, adjustments


async def rebuild_patterns_from_history():
    """
    Rebuild all patterns from historical recruiter actions.
    Useful for initializing or resetting the memory system.
    """
    db = SessionLocal()
    try:
        # get all recruiter actions
        actions = db.query(RecruiterAction).all()
        
        print(f"[Memory] Rebuilding patterns from {len(actions)} historical actions...")
        
        # clear existing patterns
        db.query(RoleSuccessPattern).delete()
        db.commit()
        
        # replay all actions
        for action in actions:
            await update_pattern_from_action(
                action.job_id,
                action.candidate_id,
                action.action
            )
        
        # get final count
        pattern_count = db.query(RoleSuccessPattern).count()
        print(f"[Memory] Rebuilt {pattern_count} patterns")
        
        return {"patterns_created": pattern_count, "actions_processed": len(actions)}
        
    except Exception as e:
        print(f"[Memory] Error rebuilding patterns: {e}")
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()

