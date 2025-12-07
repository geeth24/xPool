from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import create_tables
from routers import jobs, candidates, chat
from celery_app import celery_app


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(
    title="xP (xPool)",
    description="Candidate sourcing system using X API and Grok",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
app.include_router(candidates.router, prefix="/candidates", tags=["Candidates"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])


@app.get("/")
async def root():
    return {"message": "xP (xPool) - Candidate Sourcing System"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get the status of a Celery task."""
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None
    }
