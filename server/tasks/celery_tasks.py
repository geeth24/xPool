import asyncio
from celery_app import celery_app
from typing import Dict, Set, List, Optional
from database import SessionLocal, Job, Candidate, JobCandidate, InterviewStage, CandidateStatus, CandidateType
from services.x_api import x_api_client
from services.github_api import github_client
from services.grok_api import grok_client
from services.embedding import generate_candidate_embedding, calculate_match_scores


def _extract_github_username(github_url: str) -> str:
    """Extract username from a GitHub profile URL."""
    if not github_url:
        return ""
    parts = github_url.rstrip("/").split("/")
    return parts[-1] if parts else ""


def run_async(coro):
    """Run async function in sync context."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def process_users_from_search(db, job_id: str, users: List[Dict], max_results: int, 
                               exclude_influencers: bool, min_tweets_analyzed: int) -> Dict:
    """
    Process users returned from the User Search API.
    This is the preferred path when Pro tier is available.
    """
    candidates_analyzed = 0
    candidates_added = 0
    candidates_skipped = 0

    for user in users:
        if candidates_added >= max_results:
            break

        user_id = user.get("id")
        username = user.get("username", "")

        if not user_id:
            continue

        # Check if already in DB
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
                db.commit()
            continue

        # Quick pre-filter based on bio
        quick_score = x_api_client.quick_dev_score(user, "")
        if quick_score < 40:
            print(f"[Celery] Quick-skip @{username} (score: {quick_score})")
            candidates_skipped += 1
            continue

        # Fetch tweets for deeper analysis
        print(f"[Celery] Analyzing @{username} (quick_score: {quick_score})...")
        user_tweets = run_async(x_api_client.get_user_tweets(user_id, max_results=min_tweets_analyzed))
        candidates_analyzed += 1

        # Deep classification using Grok
        classification = run_async(grok_client.classify_user_from_tweets(user, user_tweets))

        candidate_type = classification.get("candidate_type", "unknown")
        confidence = classification.get("confidence", 0)
        recommendation = classification.get("recommendation", "skip")

        print(f"[Celery] @{username}: {candidate_type} (confidence: {confidence:.2f}, rec: {recommendation})")

        # Skip non-developers if filtering is enabled
        if exclude_influencers:
            if candidate_type in ["influencer", "recruiter", "company", "bot"]:
                print(f"[Celery] Skipping @{username} - classified as {candidate_type}")
                candidates_skipped += 1
                continue
            if recommendation == "skip" and confidence > 0.6:
                print(f"[Celery] Skipping @{username} - recommendation: skip")
                candidates_skipped += 1
                continue

        # Add candidate
        candidate_data = x_api_client.parse_user_to_candidate_data(user, user_tweets)

        type_enum = CandidateType.UNKNOWN
        if candidate_type == "developer":
            type_enum = CandidateType.DEVELOPER
        elif candidate_type == "influencer":
            type_enum = CandidateType.INFLUENCER
        elif candidate_type == "recruiter":
            type_enum = CandidateType.RECRUITER
        elif candidate_type == "company":
            type_enum = CandidateType.COMPANY
        elif candidate_type == "bot":
            type_enum = CandidateType.BOT

        # dedupe by GitHub if present
        gh_url = candidate_data.get("github_url")
        gh_username = _extract_github_username(gh_url) if gh_url else None
        if gh_url or gh_username:
            github_match = db.query(Candidate).filter(
                (Candidate.github_url == gh_url) |
                (Candidate.github_username == gh_username if gh_username else False)
            ).first()
            if github_match:
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
            linkedin_url=candidate_data.get("linkedin_url"),
            email=candidate_data.get("email"),
            location=candidate_data["location"],
            raw_tweets=candidate_data["raw_tweets"],
            candidate_type=type_enum,
            type_confidence=confidence,
            tweet_analysis=classification,
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
        db.commit()

        candidates_added += 1
        print(f"[Celery] Added candidate: @{candidate.x_username} ({candidate_type})")

    print(f"[Celery] User Search sourcing complete:")
    print(f"  - Analyzed: {candidates_analyzed}")
    print(f"  - Added: {candidates_added}")
    print(f"  - Skipped: {candidates_skipped}")

    if candidates_added > 0:
        enrich_job_candidates_task.delay(job_id)

    return {
        "method": "user_search",
        "candidates_analyzed": candidates_analyzed,
        "candidates_added": candidates_added,
        "candidates_skipped": candidates_skipped
    }


@celery_app.task(bind=True, name="tasks.source_candidates")
def source_candidates_task(
    self, 
    job_id: str, 
    max_results: int = 20,
    regions: List[str] = None,
    custom_queries: List[str] = None,
    exclude_influencers: bool = True,
    min_tweets_analyzed: int = 10,
    use_full_archive: bool = True
):
    """
    Smart candidate sourcing that:
    1. Tries User Search API first (requires Pro tier)
    2. Falls back to tweet search with smart queries
    3. Analyzes user tweets to classify (developer vs influencer)
    4. Only adds real developers to the database
    """
    print(f"[Celery] Starting smart sourcing for job {job_id} (type: {type(job_id)})")

    # Report initial progress
    self.update_state(state='PROGRESS', meta={
        'stage': 'initializing',
        'stage_label': 'Initializing...',
        'progress': 5,
        'details': {'job_id': job_id}
    })

    db = SessionLocal()
    try:
        # ensure job_id is a string
        job_id = str(job_id).strip()
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            # debug: list all jobs
            all_jobs = db.query(Job).all()
            print(f"[Celery] Job {job_id} not found. Available jobs: {[(j.id, j.title) for j in all_jobs]}")
            return {"error": f"Job not found: {job_id}"}

        keywords = job.keywords if isinstance(job.keywords, list) else []
        if not keywords and not custom_queries:
            print(f"[Celery] Job {job_id} has no keywords")
            return {"error": "No keywords"}

        # Report searching stage
        self.update_state(state='PROGRESS', meta={
            'stage': 'searching',
            'stage_label': 'Searching X/Twitter...',
            'progress': 15,
            'details': {'job_title': job.title, 'keywords': keywords[:5]}
        })

        # STRATEGY 1: Try User Search API first
        # NOTE: Requires Pro tier + User Context auth (OAuth 1.0a/2.0), not Bearer Token
        # This searches user bios/profiles directly - much better for finding developers!
        # Will gracefully fail and fall back to tweet search if not available
        user_search_query = " ".join(keywords[:3]) if keywords else job.title
        print(f"[Celery] Trying User Search API with query: {user_search_query}")

        users_from_search = run_async(x_api_client.search_users(user_search_query, max_results=max_results * 2))

        if users_from_search:
            print(f"[Celery] ✅ User Search returned {len(users_from_search)} users - using this method!")
            # Process users from User Search API
            return process_users_from_search(
                db, job_id, users_from_search, 
                max_results, exclude_influencers, min_tweets_analyzed
            )

        print(f"[Celery] User Search not available (requires Pro tier + User Context auth), falling back to tweet search...")

        # STRATEGY 2: Fall back to tweet search
        if custom_queries:
            search_queries = custom_queries
        else:
            print(f"[Celery] Generating smart search queries...")
            search_queries = run_async(
                grok_client.generate_search_queries(job.title, keywords, regions)
            )

        print(f"[Celery] Using {len(search_queries)} search queries")
        for i, q in enumerate(search_queries):
            print(f"  Query {i+1}: {q[:80]}...")

        seen_user_ids: Set[str] = set()
        candidates_analyzed = 0
        candidates_added = 0
        candidates_skipped = 0

        total_queries = len(search_queries)
        for query_idx, query in enumerate(search_queries):
            if candidates_added >= max_results:
                break

            # Update progress for each query
            progress = 20 + int((query_idx / total_queries) * 50)
            self.update_state(state='PROGRESS', meta={
                'stage': 'analyzing',
                'stage_label': f'Analyzing tweets ({query_idx+1}/{total_queries})...',
                'progress': progress,
                'details': {
                    'candidates_found': candidates_added,
                    'candidates_analyzed': candidates_analyzed,
                    'current_query': query[:50]
                }
            })

            print(f"[Celery] Searching: {query[:60]}...")
            search_results = run_async(
                x_api_client.search_tweets(
                    query,
                    max_results=max_results * 2,
                    use_full_archive=use_full_archive
                )
            )

            if not search_results:
                print(f"[Celery] No results for query")
                continue

            for result in search_results:
                if candidates_added >= max_results:
                    break

                user = result.get("user", {})
                tweet = result.get("tweet", {})
                tweet_text = tweet.get("text", "") if tweet else ""

                if not user or not user.get("id"):
                    continue

                user_id = user.get("id")
                username = user.get("username", "")

                if user_id in seen_user_ids:
                    continue
                seen_user_ids.add(user_id)

                # QUICK PRE-FILTER: Skip obviously non-developers before expensive API calls
                quick_score = x_api_client.quick_dev_score(user, tweet_text)
                if quick_score < 30:
                    print(f"[Celery] Quick-skip @{username} (score: {quick_score}) - likely not a developer")
                    candidates_skipped += 1
                    continue

                # check if already in DB
                existing = db.query(Candidate).filter(Candidate.x_user_id == user_id).first()
                if existing:
                    # just link to job if not already
                    if not any(jc.job_id == job_id for jc in existing.jobs):
                        job_candidate = JobCandidate(
                            job_id=job_id,
                            candidate_id=existing.id,
                            status=CandidateStatus.SOURCED,
                            interview_stage=InterviewStage.NOT_REACHED_OUT
                        )
                        db.add(job_candidate)
                        db.commit()
                    continue

                # fetch more tweets for analysis
                print(f"[Celery] Analyzing @{username} (quick_score: {quick_score})...")
                user_tweets = run_async(x_api_client.get_user_tweets(user_id, max_results=min_tweets_analyzed))
                candidates_analyzed += 1

                # deep classification using Grok
                classification = run_async(
                    grok_client.classify_user_from_tweets(user, user_tweets)
                )

                candidate_type = classification.get("candidate_type", "unknown")
                confidence = classification.get("confidence", 0)
                recommendation = classification.get("recommendation", "skip")

                print(f"[Celery] @{username}: {candidate_type} (confidence: {confidence:.2f}, rec: {recommendation})")

                # skip non-developers if filtering is enabled
                if exclude_influencers:
                    if candidate_type in ["influencer", "recruiter", "company", "bot"]:
                        print(f"[Celery] Skipping @{username} - classified as {candidate_type}")
                        candidates_skipped += 1
                        continue
                    if recommendation == "skip" and confidence > 0.6:
                        print(f"[Celery] Skipping @{username} - recommendation: skip")
                        candidates_skipped += 1
                        continue

                # add candidate
                candidate_data = x_api_client.parse_user_to_candidate_data(user, user_tweets)

                # map string to enum
                type_enum = CandidateType.UNKNOWN
                if candidate_type == "developer":
                    type_enum = CandidateType.DEVELOPER
                elif candidate_type == "influencer":
                    type_enum = CandidateType.INFLUENCER
                elif candidate_type == "recruiter":
                    type_enum = CandidateType.RECRUITER
                elif candidate_type == "company":
                    type_enum = CandidateType.COMPANY
                elif candidate_type == "bot":
                    type_enum = CandidateType.BOT

                # dedupe by GitHub if present
                gh_url = candidate_data.get("github_url")
                gh_username = _extract_github_username(gh_url) if gh_url else None
                if gh_url or gh_username:
                    github_match = db.query(Candidate).filter(
                        (Candidate.github_url == gh_url) |
                        (Candidate.github_username == gh_username if gh_username else False)
                    ).first()
                    if github_match:
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
                    github_username=gh_username,  # extract from github_url if present
                    website_url=candidate_data["website_url"],
                    linkedin_url=candidate_data.get("linkedin_url"),
                    email=candidate_data.get("email"),
                    location=candidate_data["location"],
                    raw_tweets=candidate_data["raw_tweets"],
                    candidate_type=type_enum,
                    type_confidence=confidence,
                    tweet_analysis=classification,
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
                db.commit()

                candidates_added += 1
                print(f"[Celery] Added candidate: @{candidate.x_username} ({candidate_type})")

        # Report enrichment stage
        self.update_state(state='PROGRESS', meta={
            'stage': 'enriching',
            'stage_label': 'Enriching candidates...',
            'progress': 85,
            'details': {
                'candidates_found': candidates_added,
                'candidates_analyzed': candidates_analyzed
            }
        })

        print(f"[Celery] Sourcing complete:")
        print(f"  - Analyzed: {candidates_analyzed}")
        print(f"  - Added: {candidates_added}")
        print(f"  - Skipped: {candidates_skipped}")

        # trigger enrichment
        if candidates_added > 0:
            enrich_job_candidates_task.delay(job_id)

        # Final complete state
        self.update_state(state='PROGRESS', meta={
            'stage': 'complete',
            'stage_label': 'Complete',
            'progress': 100,
            'details': {
                'candidates_found': candidates_added,
                'candidates_analyzed': candidates_analyzed,
                'candidates_skipped': candidates_skipped
            }
        })

        return {
            "candidates_analyzed": candidates_analyzed,
            "candidates_added": candidates_added,
            "candidates_skipped": candidates_skipped
        }

    except Exception as e:
        print(f"[Celery] Error during sourcing: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.enrich_candidates")
def enrich_job_candidates_task(self, job_id: str):
    """Celery task to enrich candidates with Grok analysis."""
    print(f"[Celery] Starting enrichment for job {job_id}")
    
    db = SessionLocal()
    try:
        job_candidates = db.query(JobCandidate).filter(
            JobCandidate.job_id == job_id
        ).all()
        
        candidate_ids = [jc.candidate_id for jc in job_candidates]
        candidates = db.query(Candidate).filter(Candidate.id.in_(candidate_ids)).all()
        
        enriched_count = 0
        for candidate in candidates:
            if not candidate.grok_summary or not candidate.skills_extracted:
                candidate_data = {
                    "bio": candidate.bio,
                    "raw_tweets": candidate.raw_tweets,
                    "x_username": candidate.x_username,
                    "display_name": candidate.display_name,
                    "github_url": candidate.github_url
                }
                
                analysis = run_async(grok_client.analyze_candidate(candidate_data))
                
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
                enriched_count += 1
                print(f"[Celery] Enriched candidate: @{candidate.x_username}")
            
            run_async(generate_candidate_embedding(candidate.id))
        
        db.commit()
        
        # calculate match scores
        run_async(calculate_match_scores(job_id))
        
        print(f"[Celery] Enrichment complete: {enriched_count} candidates enriched")
        return {"enriched": enriched_count}
        
    except Exception as e:
        print(f"[Celery] Error during enrichment: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.calculate_scores")
def calculate_scores_task(self, job_id: str, candidate_id: str = None):
    """Celery task to calculate match scores."""
    print(f"[Celery] Calculating scores for job {job_id}")
    run_async(calculate_match_scores(job_id, candidate_id))
    return {"status": "completed"}


@celery_app.task(bind=True, name="tasks.reclassify_candidate")
def reclassify_candidate_task(self, candidate_id: str):
    """Re-analyze a candidate's tweets to update their classification."""
    print(f"[Celery] Reclassifying candidate {candidate_id}")
    
    db = SessionLocal()
    try:
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return {"error": "Candidate not found"}
        
        # fetch fresh tweets
        user_tweets = run_async(x_api_client.get_user_tweets(candidate.x_user_id, max_results=15))
        
        # get user data
        user_data = run_async(x_api_client.get_user_by_id(candidate.x_user_id))
        if not user_data:
            user_data = {
                "username": candidate.x_username,
                "name": candidate.display_name,
                "description": candidate.bio,
                "public_metrics": {
                    "followers_count": candidate.followers_count,
                    "following_count": candidate.following_count
                }
            }
        
        # reclassify
        classification = run_async(
            grok_client.classify_user_from_tweets(user_data, user_tweets)
        )
        
        candidate_type = classification.get("candidate_type", "unknown")
        type_enum = CandidateType.UNKNOWN
        if candidate_type == "developer":
            type_enum = CandidateType.DEVELOPER
        elif candidate_type == "influencer":
            type_enum = CandidateType.INFLUENCER
        elif candidate_type == "recruiter":
            type_enum = CandidateType.RECRUITER
        elif candidate_type == "company":
            type_enum = CandidateType.COMPANY
        elif candidate_type == "bot":
            type_enum = CandidateType.BOT
        
        candidate.candidate_type = type_enum
        candidate.type_confidence = classification.get("confidence", 0)
        candidate.tweet_analysis = classification
        candidate.raw_tweets = user_tweets
        
        db.commit()
        
        print(f"[Celery] Reclassified @{candidate.x_username}: {candidate_type}")
        return {"candidate_type": candidate_type, "confidence": classification.get("confidence", 0)}
        
    except Exception as e:
        print(f"[Celery] Error reclassifying: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.source_from_usernames")
def source_from_usernames_task(self, job_id: str, usernames: List[str], skip_classification: bool = False):
    """Source candidates from a specific list of usernames."""
    print(f"[Celery] Sourcing from {len(usernames)} usernames for job {job_id}")

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"error": "Job not found"}

        candidates_added = 0
        candidates_skipped = 0

        for username in usernames:
            username = username.lstrip("@").strip()
            if not username:
                continue

            # Fetch user by username
            user_data = run_async(x_api_client.get_user_by_username(username))
            if not user_data:
                print(f"[Celery] User @{username} not found")
                candidates_skipped += 1
                continue

            user_id = user_data.get("id")

            # Check if already in DB
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
                    db.commit()
                continue

            # Fetch tweets
            user_tweets = run_async(x_api_client.get_user_tweets(user_id, max_results=15))

            # Classification (optional)
            if not skip_classification:
                classification = run_async(grok_client.classify_user_from_tweets(user_data, user_tweets))
                candidate_type = classification.get("candidate_type", "developer")
                confidence = classification.get("confidence", 1.0)
            else:
                classification = {"candidate_type": "developer", "confidence": 1.0}
                candidate_type = "developer"
                confidence = 1.0

            # Add candidate
            candidate_data = x_api_client.parse_user_to_candidate_data(user_data, user_tweets)

            type_enum = CandidateType.DEVELOPER if candidate_type == "developer" else CandidateType.UNKNOWN

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
                linkedin_url=candidate_data.get("linkedin_url"),
                email=candidate_data.get("email"),
                location=candidate_data["location"],
                raw_tweets=candidate_data["raw_tweets"],
                candidate_type=type_enum,
                type_confidence=confidence,
                tweet_analysis=classification,
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
            db.commit()

            candidates_added += 1
            print(f"[Celery] Added candidate: @{candidate.x_username}")

        if candidates_added > 0:
            enrich_job_candidates_task.delay(job_id)

        return {
            "candidates_added": candidates_added,
            "candidates_skipped": candidates_skipped
        }

    except Exception as e:
        print(f"[Celery] Error sourcing from usernames: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.source_from_github")
def source_from_github_task(
    self,
    job_id: str,
    search_query: str,
    language: Optional[str] = None,
    location: Optional[str] = None,
    skills: Optional[List[str]] = None,
    min_followers: int = 5,
    min_repos: int = 3,
    max_results: int = 20,
    require_x_profile: bool = False,
    min_dev_score: int = 50,
):
    """
    Source candidates from GitHub, then enrich with X profile if available.

    Flow:
    1. Search GitHub users by query/language/location using comprehensive multi-strategy search
    2. Get full profile + repos for each user
    3. Extract X/Twitter username if available
    4. If X profile exists, fetch tweets and analyze
    5. Create candidate with combined GitHub + X data
    """
    print(f"[Celery] Starting GitHub sourcing for job {job_id} (type: {type(job_id)})")
    print(
        f"[Celery] Query: {search_query}, Language: {language}, Location: {location}, Skills: {skills}"
    )

    # Report initial progress
    self.update_state(state='PROGRESS', meta={
        'stage': 'initializing',
        'stage_label': 'Initializing...',
        'progress': 5,
        'details': {'job_id': job_id, 'query': search_query}
    })

    db = SessionLocal()
    try:
        # ensure job_id is a string
        job_id = str(job_id).strip()
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            # debug: list all jobs
            all_jobs = db.query(Job).all()
            print(f"[Celery] Job {job_id} not found. Available jobs: {[(j.id, j.title) for j in all_jobs]}")
            return {"error": f"Job not found: {job_id}"}

        # Report searching stage
        self.update_state(state='PROGRESS', meta={
            'stage': 'searching',
            'stage_label': 'Searching GitHub...',
            'progress': 15,
            'details': {'job_title': job.title, 'query': search_query}
        })

        # 🧠 Use AI search strategy if available
        ai_strategy = job.search_strategy if hasattr(job, "search_strategy") else None
        enhanced_skills = skills or []
        enhanced_language = language

        if ai_strategy:
            print(
                f"[Celery] 🧠 Using AI search strategy for {ai_strategy.get('role_type', 'unknown')} role"
            )

            # Merge AI-suggested skills with provided skills
            ai_keywords = ai_strategy.get("bio_keywords", [])
            ai_topics = ai_strategy.get("repo_topics", [])
            if ai_keywords or ai_topics:
                enhanced_skills = list(
                    set(enhanced_skills + ai_keywords[:5] + ai_topics[:3])
                )
                print(f"[Celery] Enhanced skills: {enhanced_skills[:8]}")

            # Use AI-suggested language if not provided
            if not enhanced_language and ai_strategy.get("languages"):
                enhanced_language = ai_strategy["languages"][0]
                print(f"[Celery] Using AI-suggested language: {enhanced_language}")

        # search GitHub users using comprehensive multi-strategy search
        print(f"[Celery] Searching GitHub users with comprehensive strategy...")
        github_users = run_async(
            github_client.search_users_comprehensive(
                query=search_query,
                language=enhanced_language,
                location=location,
                min_followers=min_followers,
                min_repos=min_repos,
                max_results=max_results * 2,  # get extra to account for filtering
                skills=enhanced_skills if enhanced_skills else None,
            )
        )

        if not github_users:
            print(f"[Celery] No GitHub users found")
            return {"error": "No users found", "candidates_added": 0}

        print(f"[Celery] Found {len(github_users)} GitHub users")

        # Update progress
        self.update_state(state='PROGRESS', meta={
            'stage': 'analyzing',
            'stage_label': f'Analyzing {len(github_users)} profiles...',
            'progress': 25,
            'details': {'users_found': len(github_users)}
        })

        candidates_added = 0
        candidates_skipped = 0
        candidates_with_x = 0
        total_users = len(github_users)

        for idx, gh_user in enumerate(github_users):
            if candidates_added >= max_results:
                break

            # Update progress for each user
            progress = 25 + int((idx / total_users) * 55)
            self.update_state(state='PROGRESS', meta={
                'stage': 'analyzing',
                'stage_label': f'Analyzing profile {idx+1}/{total_users}...',
                'progress': progress,
                'details': {
                    'candidates_found': candidates_added,
                    'current_user': gh_user.get("login", "unknown")
                }
            })

            username = gh_user.get("login")
            if not username:
                continue

            # check if already in DB by github username
            existing = db.query(Candidate).filter(
                Candidate.github_url.contains(username)
            ).first()
            if existing:
                print(f"[Celery] Skipping @{username} - already in DB")
                if not any(jc.job_id == job_id for jc in existing.jobs):
                    job_candidate = JobCandidate(
                        job_id=job_id,
                        candidate_id=existing.id,
                        status=CandidateStatus.SOURCED,
                        interview_stage=InterviewStage.NOT_REACHED_OUT
                    )
                    db.add(job_candidate)
                    db.commit()
                continue

            # get full GitHub profile
            print(f"[Celery] Fetching full profile for {username}...")
            gh_profile = run_async(github_client.get_full_developer_profile(username))

            if not gh_profile:
                print(f"[Celery] Could not fetch profile for {username}")
                candidates_skipped += 1
                continue

            # check developer score
            dev_score = gh_profile.get("developer_score", 0)
            if dev_score < min_dev_score:
                print(f"[Celery] Skipping {username} - low dev score ({dev_score})")
                candidates_skipped += 1
                continue

            print(f"[Celery] {username}: dev_score={dev_score}, languages={list(gh_profile.get('languages', {}).keys())[:3]}")

            # check for X profile
            x_username = gh_profile.get("x_username")
            x_data = None
            x_tweets = []
            classification = None

            if x_username:
                print(f"[Celery] Found X profile: @{x_username}, fetching...")
                candidates_with_x += 1

                # get X user data
                x_user = run_async(x_api_client.get_user_by_username(x_username))
                if x_user:
                    x_data = x_user
                    x_tweets = run_async(x_api_client.get_user_tweets(x_user.get("id"), max_results=10))

                    # classify using Grok
                    classification = run_async(
                        grok_client.classify_user_from_tweets(x_user, x_tweets)
                    )

                    candidate_type = classification.get("candidate_type", "unknown")
                    confidence = classification.get("confidence", 0)
                    print(f"[Celery] X analysis: {candidate_type} (confidence: {confidence:.2f})")

                    # skip if classified as non-developer
                    if candidate_type in ["influencer", "recruiter", "company", "bot"] and confidence > 0.7:
                        print(f"[Celery] Skipping {username} - X classified as {candidate_type}")
                        candidates_skipped += 1
                        continue
            elif require_x_profile:
                print(f"[Celery] Skipping {username} - no X profile (required)")
                candidates_skipped += 1
                continue

            # create candidate
            # combine skills from GitHub and bio
            all_skills = list(gh_profile.get("languages", {}).keys()) + gh_profile.get("bio_skills", [])
            unique_skills = list(dict.fromkeys(all_skills))  # preserve order, remove dupes

            # determine candidate type
            type_enum = CandidateType.DEVELOPER
            type_confidence = 0.8  # default high confidence for GitHub sourced

            if classification:
                ct = classification.get("candidate_type", "developer")
                type_confidence = classification.get("confidence", 0.8)
                if ct == "developer":
                    type_enum = CandidateType.DEVELOPER
                elif ct == "influencer":
                    type_enum = CandidateType.INFLUENCER
                else:
                    type_enum = CandidateType.UNKNOWN

            github_id = str(gh_profile.get("github_id"))
            x_user_id = x_data.get("id") if x_data else None

            # Check if already in DB by GitHub ID or X ID
            existing = db.query(Candidate).filter(
                (Candidate.github_id == github_id) | 
                (Candidate.x_user_id == x_user_id if x_user_id else False)
            ).first()

            if existing:
                # Link to job if not already linked
                if not any(jc.job_id == job_id for jc in existing.jobs):
                    job_candidate = JobCandidate(
                        job_id=job_id,
                        candidate_id=existing.id,
                        status=CandidateStatus.SOURCED,
                        interview_stage=InterviewStage.NOT_REACHED_OUT
                    )
                    db.add(job_candidate)
                    db.commit()
                    candidates_added += 1
                    print(f"[Celery] Linked existing: {username}")
                else:
                    print(f"[Celery] Already linked: {username}")
                continue

            candidate = Candidate(
                # GitHub fields
                github_id=github_id,
                github_username=username,
                # X fields (nullable)
                x_user_id=x_user_id,
                x_username=x_username,
                # Common fields
                display_name=gh_profile.get("display_name") or username,
                bio=gh_profile.get("bio"),
                profile_url=(
                    f"https://x.com/{x_username}"
                    if x_username
                    else gh_profile.get("github_url")
                ),
                followers_count=(
                    x_data.get("public_metrics", {}).get("followers_count", 0)
                    if x_data
                    else gh_profile.get("followers", 0)
                ),
                following_count=(
                    x_data.get("public_metrics", {}).get("following_count", 0)
                    if x_data
                    else gh_profile.get("following", 0)
                ),
                github_url=gh_profile.get("github_url"),
                website_url=gh_profile.get("blog"),
                location=gh_profile.get("location"),
                # contact info
                email=gh_profile.get("email"),
                linkedin_url=gh_profile.get("linkedin_url"),
                phone=gh_profile.get("phone"),
                raw_tweets=x_tweets,
                candidate_type=type_enum,
                type_confidence=type_confidence,
                skills_extracted=unique_skills[:15],
                tweet_analysis={
                    "github_profile": {
                        "username": username,
                        "public_repos": gh_profile.get("public_repos"),
                        "followers": gh_profile.get("followers"),
                        "languages": gh_profile.get("languages"),
                        "top_repos": gh_profile.get("top_repos"),
                        "developer_score": dev_score,
                        "hireable": gh_profile.get("hireable"),
                    },
                    "x_classification": classification,
                },
            )

            db.add(candidate)
            db.flush()

            # verify job still exists before linking
            job_exists = db.query(Job).filter(Job.id == job_id).first()
            if not job_exists:
                print(f"[Celery] Job {job_id} was deleted, stopping sourcing")
                db.rollback()
                return {
                    "error": "Job was deleted during sourcing",
                    "candidates_added": candidates_added,
                    "candidates_skipped": candidates_skipped,
                }

            job_candidate = JobCandidate(
                job_id=job_id,
                candidate_id=candidate.id,
                status=CandidateStatus.SOURCED,
                interview_stage=InterviewStage.NOT_REACHED_OUT
            )
            db.add(job_candidate)
            db.commit()

            candidates_added += 1
            x_status = f"+ X @{x_username}" if x_username else "(no X)"
            print(f"[Celery] Added: {username} {x_status}")

        print(f"[Celery] GitHub sourcing complete:")
        print(f"  - Added: {candidates_added}")
        print(f"  - Skipped: {candidates_skipped}")
        print(f"  - With X profiles: {candidates_with_x}")

        # trigger enrichment and evidence generation
        if candidates_added > 0:
            enrich_job_candidates_task.delay(job_id)
            generate_evidence_cards_task.delay(job_id)

        # Final complete state
        self.update_state(state='PROGRESS', meta={
            'stage': 'complete',
            'stage_label': 'Complete',
            'progress': 100,
            'details': {
                'candidates_found': candidates_added,
                'candidates_skipped': candidates_skipped,
                'candidates_with_x': candidates_with_x
            }
        })

        return {
            "candidates_added": candidates_added,
            "candidates_skipped": candidates_skipped,
            "candidates_with_x": candidates_with_x
        }

    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError) and "job_candidates_job_id_fkey" in str(e):
            print(
                f"[Celery] Job {job_id} was deleted during sourcing - stopping gracefully"
            )
            db.rollback()
            return {
                "error": "Job was deleted during sourcing",
                "candidates_added": candidates_added,
                "candidates_skipped": candidates_skipped,
                "candidates_with_x": candidates_with_x,
            }

        print(f"[Celery] Error in GitHub sourcing: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.generate_evidence_cards")
def generate_evidence_cards_task(self, job_id: str):
    """
    Generate evidence cards for all candidates in a job.
    This explains WHY each candidate matches the role.

    🧠 SELF-IMPROVING: Uses learned patterns to improve evidence quality.
    """
    import asyncio
    from services.grok_api import grok_client
    from services.memory import get_pattern_for_job

    db = SessionLocal()

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            print(f"[Celery] Job {job_id} not found for evidence generation")
            return {"error": "Job not found"}

        job_data = {
            "title": job.title,
            "keywords": job.keywords or [],
            "requirements": job.requirements or ""
        }

        # 🧠 Get learned pattern for this role type
        learned_pattern = get_pattern_for_job(job_id)
        if learned_pattern and learned_pattern.get("confidence", 0) >= 0.2:
            print(
                f"[Celery] 🧠 Using learned pattern for {learned_pattern.get('role_type')} (confidence: {learned_pattern.get('confidence'):.0%})"
            )
        else:
            print(
                f"[Celery] No learned pattern available yet - using default evidence generation"
            )
            learned_pattern = None

        # Get all candidates for this job without evidence
        job_candidates = db.query(JobCandidate).filter(
            JobCandidate.job_id == job_id,
            JobCandidate.evidence.is_(None)
        ).all()

        print(f"[Celery] Generating evidence cards for {len(job_candidates)} candidates")

        generated = 0
        for jc in job_candidates:
            candidate = jc.candidate
            if not candidate:
                continue

            # ensure github_profile is available for richer evidence
            tweet_analysis = candidate.tweet_analysis if isinstance(candidate.tweet_analysis, dict) else {}
            github_profile = tweet_analysis.get("github_profile") or {}

            if not github_profile and candidate.github_url:
                gh_username = _extract_github_username(candidate.github_url)
                if gh_username:
                    gh_profile = run_async(github_client.get_full_developer_profile(gh_username))
                    if gh_profile:
                        github_profile = {
                            "username": gh_username,
                            "languages": gh_profile.get("languages"),
                            "top_repos": gh_profile.get("top_repos"),
                            "developer_score": gh_profile.get("developer_score"),
                            "followers": gh_profile.get("followers"),
                            "public_repos": gh_profile.get("public_repos"),
                            "hireable": gh_profile.get("hireable")
                        }
                        tweet_analysis["github_profile"] = github_profile
                        candidate.tweet_analysis = tweet_analysis
                        db.commit()

            candidate_data = {
                "bio": candidate.bio,
                "skills_extracted": candidate.skills_extracted or [],
                "raw_tweets": candidate.raw_tweets or [],
                "tweet_analysis": candidate.tweet_analysis or {}
            }

            try:
                username = candidate.github_username or candidate.x_username or "unknown"
                print(f"[Celery] Processing evidence for {username}...")

                # 🧠 Pass learned pattern to evidence generation
                evidence = run_async(
                    grok_client.generate_evidence_card(
                        candidate_data, job_data, learned_pattern
                    )
                )

                # Add metadata about learning
                if learned_pattern:
                    evidence["_learning_applied"] = True
                    evidence["_pattern_confidence"] = learned_pattern.get(
                        "confidence", 0
                    )

                jc.evidence = evidence
                db.commit()
                generated += 1

                print(f"[Celery] Generated evidence for {username}: {evidence.get('match_strength', 'unknown')}")

            except Exception as e:
                import traceback
                print(f"[Celery] Error generating evidence for {candidate.id}: {e}")
                traceback.print_exc()
                continue

        print(f"[Celery] Evidence generation complete: {generated} cards generated")
        return {
            "generated": generated,
            "learning_applied": learned_pattern is not None,
            "pattern_confidence": (
                learned_pattern.get("confidence", 0) if learned_pattern else 0
            ),
        }

    except Exception as e:
        print(f"[Celery] Error in evidence generation: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    finally:
        db.close()
