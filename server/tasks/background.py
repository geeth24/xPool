import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime

from database import SessionLocal, Job, JobStatus
from services.sourcing import source_candidates_for_job
from services.embedding import calculate_match_scores

scheduler = AsyncIOScheduler()


async def periodic_sourcing_job():
    """Run sourcing for all active jobs periodically."""
    print(f"[{datetime.now()}] Running periodic sourcing job...")
    
    db = SessionLocal()
    try:
        active_jobs = db.query(Job).filter(Job.status == JobStatus.ACTIVE).all()
        
        for job in active_jobs:
            if job.keywords:
                print(f"Sourcing for job: {job.title}")
                await source_candidates_for_job(job.id, max_results=10)
                await asyncio.sleep(2)
        
        print(f"[{datetime.now()}] Periodic sourcing complete")
    except Exception as e:
        print(f"Error in periodic sourcing: {e}")
    finally:
        db.close()


async def periodic_score_update():
    """Update match scores for all jobs periodically."""
    print(f"[{datetime.now()}] Running score update job...")
    
    db = SessionLocal()
    try:
        active_jobs = db.query(Job).filter(Job.status == JobStatus.ACTIVE).all()
        
        for job in active_jobs:
            await calculate_match_scores(job.id)
            await asyncio.sleep(1)
        
        print(f"[{datetime.now()}] Score update complete")
    except Exception as e:
        print(f"Error in score update: {e}")
    finally:
        db.close()


def start_scheduler():
    """Start the background job scheduler."""
    scheduler.add_job(
        periodic_sourcing_job,
        trigger=IntervalTrigger(hours=6),
        id="periodic_sourcing",
        name="Periodic Candidate Sourcing",
        replace_existing=True
    )
    
    scheduler.add_job(
        periodic_score_update,
        trigger=IntervalTrigger(hours=1),
        id="score_update",
        name="Match Score Update",
        replace_existing=True
    )
    
    scheduler.start()
    print("Background scheduler started")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    scheduler.shutdown(wait=False)
    print("Background scheduler stopped")


async def run_sourcing_now(job_id: str, max_results: int = 20):
    """Manually trigger sourcing for a specific job."""
    await source_candidates_for_job(job_id, max_results)


async def run_score_update_now(job_id: str):
    """Manually trigger score update for a specific job."""
    await calculate_match_scores(job_id)


