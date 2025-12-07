from typing import List, Dict, Set
from database import SessionLocal, Job, Candidate, JobCandidate, InterviewStage, CandidateStatus
from services.x_api import x_api_client
from services.grok_api import grok_client
from services.embedding import generate_candidate_embedding, calculate_match_scores


def _extract_github_username(github_url: str) -> str:
    """Extract username from a GitHub profile URL."""
    if not github_url:
        return ""
    parts = github_url.rstrip("/").split("/")
    return parts[-1] if parts else ""


def is_likely_bot_or_job_board(user: Dict) -> bool:
    """Filter out job posting accounts, bots, and aggregators."""
    username = (user.get("username") or "").lower()
    name = (user.get("name") or "").lower()
    bio = (user.get("description") or "").lower()
    
    # bot/job board indicators in username
    bot_username_patterns = [
        "jobs", "hiring", "career", "recruit", "remote", "work", 
        "bot", "feed", "alert", "post", "board", "echo", "apply",
        "vacancy", "openings", "opportunity"
    ]
    for pattern in bot_username_patterns:
        if pattern in username:
            return True
    
    # bot indicators in bio
    bot_bio_patterns = [
        "job posting", "job board", "job alert", "job feed",
        "we post", "posting jobs", "automated", "bot account",
        "follow for jobs", "follow for new jobs", "hiring platform",
        "career platform", "recruitment agency", "staffing"
    ]
    for pattern in bot_bio_patterns:
        if pattern in bio:
            return True
    
    # too many followers with very few following = likely aggregator
    metrics = user.get("public_metrics", {})
    followers = metrics.get("followers_count", 0)
    following = metrics.get("following_count", 0)
    if followers > 1000 and following < 50:
        return True
    
    return False


async def source_candidates_for_job(job_id: str, max_results: int = 20):
    """Source candidates from X API for a specific job."""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            print(f"Job {job_id} not found")
            return
        
        keywords = job.keywords if isinstance(job.keywords, list) else []
        if not keywords:
            print(f"Job {job_id} has no keywords")
            return
        
        # build query to find real developers talking about their work
        skill_query = " OR ".join(keywords)
        
        # search for people sharing their work, building things, or discussing tech
        personal_indicators = [
            "I built", "I'm working on", "my project", "just shipped",
            "learning", "excited to", "building", "working on", "created"
        ]
        personal_query = " OR ".join([f'"{p}"' for p in personal_indicators[:3]])
        
        # combine: skills + personal language, exclude retweets and job posts
        query = f"({skill_query}) ({personal_query}) -is:retweet -hiring -job -vacancy -apply -#hiring lang:en"
        
        print(f"Searching X for: {query}")
        
        search_results = await x_api_client.search_tweets(query, max_results=max_results * 2)
        
        if not search_results:
            print("No results from X API")
            return
        
        seen_user_ids: Set[str] = set()
        new_candidates = 0
        
        for result in search_results:
            user = result.get("user", {})
            tweet = result.get("tweet", {})
            
            if not user or not user.get("id"):
                continue
            
            user_id = user.get("id")
            
            if user_id in seen_user_ids:
                continue
            seen_user_ids.add(user_id)
            
            # skip bots and job boards
            if is_likely_bot_or_job_board(user):
                print(f"Skipping bot/job board: @{user.get('username')}")
                continue
            
            # dedupe by X id first
            existing = db.query(Candidate).filter(Candidate.x_user_id == user_id).first()
            
            if existing:
                if not any(jc.job_id == job_id for jc in existing.jobs):
                    job_candidate = JobCandidate(
                        job_id=job_id,
                        candidate_id=existing.id,
                        status=CandidateStatus.SOURCED,
                        interview_stage=InterviewStage.NOT_REACHED_OUT
                    )
                    db.add(job_candidate)
                continue
            user_tweets = await x_api_client.get_user_tweets(user_id, max_results=10)
            
            candidate_data = x_api_client.parse_user_to_candidate_data(user, user_tweets)
            
            # dedupe by GitHub URL if present
            gh_url = candidate_data.get("github_url")
            gh_username = _extract_github_username(gh_url) if gh_url else None
            if gh_url or gh_username:
                github_match = db.query(Candidate).filter(
                    (Candidate.github_url == gh_url) | 
                    (Candidate.github_username == gh_username if gh_username else False)
                ).first()
                if github_match:
                    # link to job if not already linked
                    if not any(jc.job_id == job_id for jc in github_match.jobs):
                        job_candidate = JobCandidate(
                            job_id=job_id,
                            candidate_id=github_match.id,
                            status=CandidateStatus.SOURCED,
                            interview_stage=InterviewStage.NOT_REACHED_OUT
                        )
                        db.add(job_candidate)
                        db.commit()
                    continue

            candidate = Candidate(
                x_user_id=candidate_data["x_user_id"],
                x_username=candidate_data["x_username"],
                display_name=candidate_data["display_name"],
                bio=candidate_data["bio"],
                profile_url=candidate_data["profile_url"],
                followers_count=candidate_data["followers_count"],
                following_count=candidate_data["following_count"],
                github_url=candidate_data["github_url"],
                website_url=candidate_data["website_url"],
                location=candidate_data["location"],
                raw_tweets=candidate_data["raw_tweets"]
            )
            
            db.add(candidate)
            db.flush()
            
            job_candidate = JobCandidate(
                job_id=job_id,
                candidate_id=candidate.id,
                status=CandidateStatus.SOURCED,
                interview_stage=InterviewStage.NOT_REACHED_OUT
            )
            db.add(job_candidate)
            
            new_candidates += 1
            print(f"Added candidate: @{candidate.x_username}")
        
        db.commit()
        print(f"Sourcing complete: {new_candidates} new candidates added")
        
        await enrich_job_candidates(job_id)
        
    except Exception as e:
        print(f"Error during sourcing: {e}")
        db.rollback()
    finally:
        db.close()


async def enrich_job_candidates(job_id: str):
    """Enrich candidates with Grok analysis and embeddings."""
    db = SessionLocal()
    try:
        job_candidates = db.query(JobCandidate).filter(
            JobCandidate.job_id == job_id
        ).all()
        
        for jc in job_candidates:
            candidate = jc.candidate
            
            if not candidate.grok_summary or not candidate.skills_extracted:
                candidate_data = {
                    "bio": candidate.bio,
                    "raw_tweets": candidate.raw_tweets,
                    "x_username": candidate.x_username,
                    "display_name": candidate.display_name,
                    "github_url": candidate.github_url
                }
                
                analysis = await grok_client.analyze_candidate(candidate_data)
                
                if analysis.get("summary"):
                    candidate.grok_summary = analysis["summary"]
                if analysis.get("skills"):
                    candidate.skills_extracted = analysis["skills"]
                if analysis.get("years_experience"):
                    candidate.years_experience = analysis["years_experience"]
                if analysis.get("codeforces_rating"):
                    candidate.codeforces_rating = analysis["codeforces_rating"]
                if analysis.get("github_repos_count"):
                    candidate.github_repos_count = analysis["github_repos_count"]
                
                print(f"Enriched candidate: @{candidate.x_username}")
            
            await generate_candidate_embedding(candidate.id)
        
        db.commit()
        
        await calculate_match_scores(job_id)
        
    except Exception as e:
        print(f"Error during enrichment: {e}")
        db.rollback()
    finally:
        db.close()


async def enrich_single_candidate(candidate_id: str):
    """Enrich a single candidate with Grok analysis."""
    db = SessionLocal()
    try:
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return
        
        candidate_data = {
            "bio": candidate.bio,
            "raw_tweets": candidate.raw_tweets,
            "x_username": candidate.x_username,
            "display_name": candidate.display_name,
            "github_url": candidate.github_url
        }
        
        analysis = await grok_client.analyze_candidate(candidate_data)
        
        if analysis.get("summary"):
            candidate.grok_summary = analysis["summary"]
        if analysis.get("skills"):
            candidate.skills_extracted = analysis["skills"]
        if analysis.get("years_experience"):
            candidate.years_experience = analysis["years_experience"]
        if analysis.get("codeforces_rating"):
            candidate.codeforces_rating = analysis["codeforces_rating"]
        if analysis.get("github_repos_count"):
            candidate.github_repos_count = analysis["github_repos_count"]
        
        db.commit()
        
        await generate_candidate_embedding(candidate_id)
        
    except Exception as e:
        print(f"Error enriching candidate: {e}")
        db.rollback()
    finally:
        db.close()

