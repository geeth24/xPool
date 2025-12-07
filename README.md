# xP (xPool) - AI-Powered Candidate Sourcing System

> **Smart talent sourcing using X (Twitter) API and Grok AI to find real developers, not influencers.**

xPool is an intelligent candidate sourcing and tracking system that leverages the X API to find potential candidates and uses Grok AI to deeply analyze their tweets to distinguish real developers from influencers, recruiters, and bots.

## 🎯 Key Features

### Smart Candidate Discovery
- **AI-Generated Search Queries**: Grok generates optimized X search queries that look for first-person language ("I built", "working on", "shipped") to find people who actually code
- **Deep Tweet Analysis**: Analyzes 15+ tweets per user to classify them accurately
- **Intelligent Filtering**: Automatically skips companies, bots, recruiters, and influencers
- **Region Support**: Optional geographic filtering

### Candidate Classification
Each candidate is classified with:
- **Type**: `developer`, `influencer`, `recruiter`, `company`, `bot`, or `unknown`
- **Confidence Score**: 0-100% confidence in the classification
- **Tech Stack**: Technologies they actually use (not just talk about)
- **Seniority**: `junior`, `mid`, `senior`, `lead`, or `unknown`
- **Recommendation**: `source`, `maybe`, or `skip`

### Candidate Management
- **Interview Pipeline**: Track candidates through stages (not reached out → phone screen → interviews → offer)
- **Match Scoring**: AI-powered scoring of candidate-job fit (0-100%)
- **Skills Extraction**: Automatic extraction of technical skills from tweets
- **Hybrid Search**: Combine SQL filters with natural language queries

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         xPool System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  FastAPI │    │  Celery  │    │  Redis   │    │  SQLite  │  │
│  │  Server  │◄──►│  Worker  │◄──►│  Broker  │    │    DB    │  │
│  └────┬─────┘    └────┬─────┘    └──────────┘    └────┬─────┘  │
│       │               │                               │         │
│       │               ▼                               │         │
│       │    ┌─────────────────────┐                   │         │
│       │    │   Background Tasks   │                   │         │
│       │    │  • source_candidates │                   │         │
│       │    │  • enrich_candidates │                   │         │
│       │    │  • calculate_scores  │                   │         │
│       │    │  • reclassify        │                   │         │
│       │    └─────────────────────┘                   │         │
│       │               │                               │         │
│       ▼               ▼                               │         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    External APIs                         │   │
│  │  ┌─────────────┐              ┌─────────────────────┐   │   │
│  │  │   X API     │              │      Grok API       │   │   │
│  │  │ • Search    │              │ • Classification    │   │   │
│  │  │ • Users     │              │ • Query Generation  │   │   │
│  │  │ • Tweets    │              │ • Skills Extraction │   │   │
│  │  └─────────────┘              │ • Match Scoring     │   │   │
│  │                               └─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Docker (for Redis)
- X API Bearer Token
- xAI API Bearer Token

### 1. Clone and Setup

```bash
cd xai-hackathon

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
cd server
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# X (Twitter) API
X_API_BEARER_TOKEN=your_x_api_bearer_token
X_CONSUMER_KEY=your_consumer_key
X_CONSUMER_KEY_SECRET=your_consumer_secret

# xAI (Grok) API
X_AI_API_BEARER_TOKEN=your_xai_api_key
XAI_MANAGEMENT_API_KEY=your_management_key  # For Collections

# Optional
REDIS_URL=redis://localhost:6379/0
```

### 3. Start Services

```bash
# Start Redis (required for Celery)
docker-compose up -d

# Start FastAPI server
cd server
uvicorn main:app --reload --port 8000

# In another terminal - Start Celery worker
cd server
celery -A celery_app worker --loglevel=info
```

### 4. Access the API

- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## 📚 API Reference

### Jobs

#### Create a Job
```bash
POST /jobs
{
  "title": "Senior iOS Developer",
  "description": "SwiftUI expert for fintech app",
  "keywords": ["iOS", "SwiftUI", "Swift", "mobile"],
  "requirements": "5+ years iOS, SwiftUI experience"
}
```

#### Trigger Smart Sourcing
```bash
POST /jobs/{job_id}/source
{
  "max_results": 20,
  "regions": ["USA", "UK"],           # Optional
  "exclude_influencers": true,         # Default: true
  "min_tweets_analyzed": 15,           # Default: 10
  "search_queries": [...]              # Optional custom queries
}
```

Response:
```json
{
  "message": "Smart sourcing started for job {job_id}",
  "max_results": 20,
  "regions": ["USA", "UK"],
  "exclude_influencers": true,
  "task_id": "abc123..."
}
```

#### Get Job Candidates (Ranked)
```bash
GET /jobs/{job_id}/candidates?top_k=10&sort_by=match_score
```

#### Trigger Enrichment
```bash
POST /jobs/{job_id}/enrich
```

#### Calculate Match Scores
```bash
POST /jobs/{job_id}/calculate-scores
```

### Candidates

#### List All Candidates
```bash
GET /candidates
```

#### Get Candidates by Type
```bash
GET /candidates/by-type/developer
GET /candidates/by-type/influencer
GET /candidates/by-type/bot
```

#### Reclassify a Candidate
```bash
POST /candidates/{candidate_id}/reclassify
```

#### Search Candidates (Hybrid)
```bash
POST /candidates/search
{
  "query": "iOS experience with SwiftUI",
  "filters": {
    "interview_stage": ["not_reached_out"],
    "min_years_experience": 3,
    "skills": ["Swift", "iOS"]
  },
  "top_k": 10
}
```

#### Filter by Interview Stage
```bash
GET /candidates/by-job/{job_id}/not-reached-out?top_k=20
```

### Task Status

```bash
GET /tasks/{task_id}
```

Response:
```json
{
  "task_id": "abc123...",
  "status": "SUCCESS",
  "result": {"candidates_added": 5, "candidates_skipped": 15}
}
```

## 🧠 How Smart Sourcing Works

### 1. Query Generation
Grok AI generates 5 optimized search queries based on job requirements:

```
Query 1: iOS SwiftUI "I built" OR "I shipped" OR "working on" -job -hiring...
Query 2: Swift iOS "my app" OR "my project" mobile -influencer -hiring...
Query 3: iOS developer "I fixed" OR "I implemented" -recruitment -jobs...
```

### 2. Tweet Analysis
For each potential candidate, the system:
1. Fetches 15 recent tweets with engagement metrics
2. Sends to Grok for deep analysis
3. Receives classification:

```json
{
  "candidate_type": "developer",
  "confidence": 0.90,
  "reasoning": "Shows evidence of actual coding work...",
  "is_actively_coding": true,
  "tech_stack": ["TypeScript", "React", "Swift"],
  "red_flags": [],
  "green_flags": ["Shares code snippets", "Discusses bugs"],
  "engagement_pattern": "genuine_technical",
  "recommendation": "source",
  "estimated_seniority": "senior"
}
```

### 3. Filtering Logic
```
IF candidate_type IN [influencer, recruiter, company, bot]:
    SKIP
ELIF recommendation == "skip" AND confidence > 0.6:
    SKIP
ELSE:
    ADD to database
```

### 4. Enrichment
After sourcing, candidates are enriched with:
- Professional summary
- Extracted skills
- Estimated years of experience
- Match score for the job

## 📊 Data Models

### Candidate
```python
{
  "id": "uuid",
  "x_user_id": "12345",
  "x_username": "developer_jane",
  "display_name": "Jane Developer",
  "bio": "iOS developer...",
  "followers_count": 1500,
  "following_count": 300,
  "github_url": "https://github.com/jane",
  "location": "San Francisco",
  
  # AI-Generated
  "grok_summary": "Senior iOS developer with 5+ years...",
  "skills_extracted": ["Swift", "SwiftUI", "iOS", "Combine"],
  "years_experience": 5,
  
  # Classification
  "candidate_type": "developer",
  "type_confidence": 0.90,
  "tweet_analysis": {...}
}
```

### Job-Candidate Relationship
```python
{
  "job_id": "uuid",
  "candidate_id": "uuid",
  "status": "sourced|shortlisted|interviewing|rejected|hired",
  "interview_stage": "not_reached_out|phone_screen|stage_1|final|offer",
  "match_score": 85.5,
  "notes": "Strong SwiftUI background"
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `X_API_BEARER_TOKEN` | X API authentication | Yes |
| `X_AI_API_BEARER_TOKEN` | Grok API authentication | Yes |
| `XAI_MANAGEMENT_API_KEY` | xAI Collections API | No |
| `REDIS_URL` | Redis connection string | No (default: localhost:6379) |

### Celery Configuration
Located in `server/celery_app.py`:
- Task timeout: 600 seconds
- Serializer: JSON
- Concurrency: 12 workers (default)

## 📁 Project Structure

```
xai-hackathon/
├── docker-compose.yml          # Redis service
├── .env                        # Environment variables
├── README.md
│
└── server/
    ├── main.py                 # FastAPI application
    ├── config.py               # Settings management
    ├── database.py             # SQLAlchemy models
    ├── models.py               # Pydantic schemas
    ├── celery_app.py           # Celery configuration
    ├── requirements.txt
    │
    ├── routers/
    │   ├── jobs.py             # Job endpoints
    │   └── candidates.py       # Candidate endpoints
    │
    ├── services/
    │   ├── x_api.py            # X API client
    │   ├── grok_api.py         # Grok AI client
    │   ├── embedding.py        # xAI Collections
    │   └── sourcing.py         # Sourcing logic
    │
    └── tasks/
        └── celery_tasks.py     # Background tasks
```

## 🎯 Use Cases

### 1. Source iOS Developers in the US
```bash
curl -X POST "http://localhost:8000/jobs/{job_id}/source" \
  -H "Content-Type: application/json" \
  -d '{
    "max_results": 20,
    "regions": ["USA"],
    "exclude_influencers": true
  }'
```

### 2. Find Python ML Engineers
```bash
# Create job
curl -X POST "http://localhost:8000/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "ML Engineer",
    "keywords": ["python", "machine learning", "pytorch", "tensorflow"],
    "requirements": "3+ years ML experience, strong Python"
  }'

# Source with custom queries
curl -X POST "http://localhost:8000/jobs/{job_id}/source" \
  -H "Content-Type: application/json" \
  -d '{
    "max_results": 15,
    "search_queries": [
      "\"training model\" OR \"fine-tuning\" pytorch -job lang:en",
      "\"I trained\" OR \"my model\" machine learning -hiring lang:en"
    ]
  }'
```

### 3. Get Top Candidates for a Job
```bash
curl "http://localhost:8000/jobs/{job_id}/candidates?top_k=10&sort_by=match_score"
```

### 4. Update Candidate Interview Stage
```bash
curl -X PUT "http://localhost:8000/jobs/{job_id}/candidates/{candidate_id}" \
  -H "Content-Type: application/json" \
  -d '{
    "interview_stage": "phone_screen",
    "notes": "Scheduled for Monday 10am"
  }'
```

## 🔒 Rate Limits & Best Practices

### X API
- Basic tier: 10,000 tweets/month
- Use `max_results` wisely
- Queries are cached per search

### Grok API
- Each candidate analysis = 1 API call
- Each query generation = 1 API call
- Match scoring = 1 call per candidate

### Recommendations
1. Start with `max_results: 10-20` to test
2. Use `exclude_influencers: true` to reduce noise
3. Increase `min_tweets_analyzed` for better accuracy
4. Use regions to narrow search scope

## 🐛 Troubleshooting

### Celery tasks not running
```bash
# Check Redis is running
docker ps

# Check Celery worker logs
celery -A celery_app worker --loglevel=debug
```

### No candidates found
- Check X API rate limits
- Try broader keywords
- Reduce filtering strictness: `exclude_influencers: false`

### Classification seems wrong
- Use `/candidates/{id}/reclassify` to re-analyze
- Check `tweet_analysis` field for reasoning

## 📄 License

MIT License - See LICENSE file

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

Built with ❤️ for the xAI Hackathon


