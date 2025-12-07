from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import httpx
import json
import asyncio

from database import get_db, Job, Candidate, JobCandidate
from config import settings
from services.grok_api import grok_client
from tasks.celery_tasks import (
    source_candidates_task, 
    source_from_github_task,
    calculate_scores_task,
    generate_evidence_cards_task
)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: user, assistant, or system")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Conversation history")
    stream: bool = Field(default=True, description="Whether to stream the response")


class ToolResult(BaseModel):
    tool_name: str
    result: Any
    success: bool


# define the tools Grok can call
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_jobs",
            "description": "List all jobs in the system. Use this to see what positions are open for sourcing.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_job_details",
            "description": "Get detailed information about a specific job including requirements and keywords.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job to get details for"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_job",
            "description": "Create a new job posting. Ask the user for title, description, keywords, and requirements if not provided.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Job title (e.g., 'Senior iOS Engineer')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Job description"
                    },
                    "keywords": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Keywords for candidate search (e.g., ['Swift', 'iOS', 'SwiftUI'])"
                    },
                    "requirements": {
                        "type": "string",
                        "description": "Detailed job requirements"
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_sourcing",
            "description": "Start sourcing candidates for a job from X/Twitter. This finds developers who tweet about relevant technologies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The job ID to source candidates for"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of candidates to find (default: 20)"
                    },
                    "exclude_influencers": {
                        "type": "boolean",
                        "description": "Filter out tech influencers who don't actually code (default: true)"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_github_sourcing",
            "description": "Start sourcing candidates from GitHub. Better for finding verified developers with actual code. Uses comprehensive multi-strategy search including bio search, repo topic search, and contributor discovery.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The job ID to source candidates for"
                    },
                    "search_query": {
                        "type": "string",
                        "description": "Search query for GitHub users (e.g., 'iOS developer', 'machine learning engineer')"
                    },
                    "language": {
                        "type": "string",
                        "description": "Primary programming language filter (e.g., 'swift', 'python', 'kotlin')"
                    },
                    "location": {
                        "type": "string",
                        "description": "Location filter (e.g., 'San Francisco', 'remote')"
                    },
                    "skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of skills to search for (e.g., ['Swift', 'SwiftUI', 'iOS']). Used to find repos and contributors."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of candidates (default: 20)"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_job_candidates",
            "description": "Get the list of candidates sourced for a job, sorted by match score.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The job ID to get candidates for"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of top candidates to return (default: 10)"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_candidates",
            "description": "Search all candidates in the database using natural language queries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query (e.g., 'iOS developers with SwiftUI experience')"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default: 10)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "get_candidate_details",
            "description": "Get detailed information about a specific candidate including their skills, GitHub profile, and tweets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The candidate ID to get details for"
                    }
                },
                "required": ["candidate_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_evidence_cards",
            "description": "Generate evidence cards explaining WHY each candidate matches a job. This analyzes their repos and tweets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The job ID to generate evidence for"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_task_status",
            "description": "Check the status of a background task (sourcing, enrichment, etc.)",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "The task ID to check"
                    }
                },
                "required": ["task_id"]
            }
        }
    }
]

SYSTEM_PROMPT = """You are an AI recruiting assistant for xPool, a candidate sourcing platform. You help recruiters find and evaluate technical talent.

Your capabilities:
1. Create job postings with smart keyword generation
2. Source candidates from X/Twitter (finds developers by their tweets)
3. Source candidates from GitHub (finds developers by their code)
4. Search and filter the candidate database
5. Generate evidence cards explaining why candidates match jobs
6. Track sourcing tasks and report progress

When helping users:
- Ask clarifying questions if the request is vague (what role? what skills? what location?)
- Explain what you're doing and why
- After starting a sourcing task, let them know it runs in the background and offer to check status
- When showing candidates, highlight the most relevant ones and explain why they match
- Be conversational and helpful, not robotic

You have access to tools to perform these actions. Use them proactively to help the user."""


async def execute_tool(tool_name: str, arguments: Dict, db: Session) -> Dict:
    """Execute a tool and return the result."""
    try:
        if tool_name == "list_jobs":
            jobs = db.query(Job).limit(20).all()
            return {
                "success": True,
                "jobs": [
                    {
                        "id": j.id,
                        "title": j.title,
                        "keywords": j.keywords,
                        "created_at": str(j.created_at)
                    }
                    for j in jobs
                ]
            }
        
        elif tool_name == "get_job_details":
            job_id = str(arguments["job_id"]).strip()
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                # try to find by title as fallback
                job = db.query(Job).filter(Job.title.ilike(f"%{job_id}%")).order_by(Job.created_at.desc()).first()
            if not job:
                return {"success": False, "error": f"Job not found with id: {job_id}"}
            
            candidate_count = db.query(JobCandidate).filter(
                JobCandidate.job_id == job.id
            ).count()
            
            return {
                "success": True,
                "job": {
                    "id": job.id,
                    "title": job.title,
                    "description": job.description,
                    "keywords": job.keywords,
                    "requirements": job.requirements,
                    "candidate_count": candidate_count,
                    "created_at": str(job.created_at)
                }
            }
        
        elif tool_name == "create_job":
            # generate description/keywords if not provided
            title = arguments.get("title")
            description = arguments.get("description")
            keywords = arguments.get("keywords", [])
            requirements = arguments.get("requirements")
            
            if not description or not keywords:
                # use Grok to generate
                prompt = f"""Generate job details for: "{title}"
                
Respond with JSON:
{{
    "description": "2-3 paragraph job description",
    "keywords": ["8-12", "relevant", "technical", "keywords"],
    "requirements": "Detailed requirements"
}}"""
                messages = [
                    {"role": "system", "content": "You are a technical recruiter. Generate realistic job details."},
                    {"role": "user", "content": prompt}
                ]
                response = await grok_client.chat_completion(messages)
                if response:
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', response)
                    if json_match:
                        generated = json.loads(json_match.group())
                        description = description or generated.get("description", "")
                        keywords = keywords or generated.get("keywords", [])
                        requirements = requirements or generated.get("requirements", "")
            
            job = Job(
                title=title,
                description=description,
                keywords=keywords,
                requirements=requirements
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            
            print(f"[Chat] Created job: {job.title} with id: {job.id}")
            
            return {
                "success": True,
                "job_id": job.id,  # top-level for easy access
                "job": {
                    "id": job.id,
                    "title": job.title,
                    "keywords": job.keywords
                },
                "message": f"Created job '{title}' with ID {job.id}. Use job_id='{job.id}' for sourcing."
            }
        
        elif tool_name == "start_sourcing":
            job_id = str(arguments["job_id"]).strip()
            print(f"[Chat] start_sourcing called with job_id: {job_id}")
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                # try to find by title as fallback
                job = db.query(Job).filter(Job.title.ilike(f"%{job_id}%")).order_by(Job.created_at.desc()).first()
                if job:
                    job_id = job.id
                    print(f"[Chat] Found job by title match: {job.title} (id: {job_id})")
                else:
                    print(f"[Chat] Job not found for id: {job_id}")
                    return {"success": False, "error": f"Job not found with id: {job_id}"}
            
            max_results = arguments.get("max_results", 20)
            exclude_influencers = arguments.get("exclude_influencers", True)
            
            task = source_candidates_task.delay(
                job_id,
                max_results,
                None,  # regions
                None,  # custom queries
                exclude_influencers,
                5,     # min_tweets_analyzed
                False  # use_full_archive
            )
            
            return {
                "success": True,
                "task_id": task.id,
                "job_title": job.title,
                "message": f"Started sourcing up to {max_results} candidates for '{job.title}'. Task ID: {task.id}"
            }
        
        elif tool_name == "start_github_sourcing":
            job_id = str(arguments["job_id"]).strip()
            print(f"[Chat] start_github_sourcing called with job_id: {job_id}")
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                # try to find by title as fallback
                job = db.query(Job).filter(Job.title.ilike(f"%{job_id}%")).order_by(Job.created_at.desc()).first()
                if job:
                    job_id = job.id
                    print(f"[Chat] Found job by title match: {job.title} (id: {job_id})")
                else:
                    print(f"[Chat] Job not found for id: {job_id}")
                    return {"success": False, "error": f"Job not found with id: {job_id}"}
            
            search_query = arguments.get("search_query", job.title)
            skills = arguments.get("skills", job.keywords)  # use job keywords as fallback
            
            print(f"[Chat] GitHub sourcing: query='{search_query}', skills={skills}, location={arguments.get('location')}")
            
            task = source_from_github_task.delay(
                job_id,
                search_query,
                arguments.get("language"),
                arguments.get("location"),
                skills,  # pass skills for comprehensive search
                0,   # min_followers
                0,   # min_repos
                arguments.get("max_results", 20),
                False,  # require_x_profile
                0    # min_dev_score
            )
            
            return {
                "success": True,
                "task_id": task.id,
                "job_title": job.title,
                "search_query": search_query,
                "skills": skills,
                "message": f"Started comprehensive GitHub sourcing for '{job.title}'. Using multi-strategy search with skills: {skills[:5] if skills else 'auto-detected'}. Task ID: {task.id}"
            }
        
        elif tool_name == "get_job_candidates":
            job_id = str(arguments["job_id"]).strip()
            top_k = arguments.get("top_k", 10)
            
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                # try to find by title as fallback
                job = db.query(Job).filter(Job.title.ilike(f"%{job_id}%")).order_by(Job.created_at.desc()).first()
                if job:
                    job_id = job.id
            if not job:
                return {"success": False, "error": f"Job not found with id: {job_id}"}
            
            job_candidates = db.query(JobCandidate).filter(
                JobCandidate.job_id == job_id
            ).order_by(
                JobCandidate.match_score.desc().nullslast()
            ).limit(top_k).all()
            
            candidates = []
            for jc in job_candidates:
                c = jc.candidate
                candidates.append({
                    "id": c.id,
                    "x_username": c.x_username,
                    "display_name": c.display_name,
                    "bio": c.bio[:200] if c.bio else None,
                    "skills": c.skills_extracted[:5] if c.skills_extracted else [],
                    "match_score": jc.match_score,
                    "github_url": c.github_url,
                    "status": jc.status.value if jc.status else "sourced"
                })
            
            return {
                "success": True,
                "job_title": job.title,
                "total_candidates": len(candidates),
                "candidates": candidates
            }
        
        elif tool_name == "search_candidates":
            from services.embedding import find_similar_candidates
            
            query = arguments["query"]
            top_k = arguments.get("top_k", 10)
            
            # get all candidate IDs
            all_candidates = db.query(Candidate).all()
            candidate_ids = [c.id for c in all_candidates]
            
            if not candidate_ids:
                return {"success": True, "candidates": [], "message": "No candidates in database yet"}
            
            # find similar
            similarities = await find_similar_candidates(query, candidate_ids, top_k)
            
            results = []
            for cid, score in similarities:
                c = db.query(Candidate).filter(Candidate.id == cid).first()
                if c:
                    results.append({
                        "id": c.id,
                        "x_username": c.x_username,
                        "display_name": c.display_name,
                        "bio": c.bio[:200] if c.bio else None,
                        "skills": c.skills_extracted[:5] if c.skills_extracted else [],
                        "similarity_score": round(score, 2),
                        "github_url": c.github_url
                    })
            
            return {
                "success": True,
                "query": query,
                "candidates": results
            }
        
        elif tool_name == "get_candidate_details":
            candidate_id = arguments["candidate_id"]
            c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not c:
                return {"success": False, "error": "Candidate not found"}
            
            tweet_analysis = c.tweet_analysis or {}
            github_profile = tweet_analysis.get("github_profile", {}) or {}
            
            return {
                "success": True,
                "candidate": {
                    "id": c.id,
                    "x_username": c.x_username,
                    "display_name": c.display_name,
                    "bio": c.bio,
                    "skills": c.skills_extracted,
                    "github_url": c.github_url,
                    "github_developer_score": github_profile.get("developer_score"),
                    "github_languages": list(github_profile.get("languages", {}).keys())[:5],
                    "top_repos": github_profile.get("top_repos", [])[:3],
                    "followers": c.followers_count,
                    "grok_summary": c.grok_summary,
                    "candidate_type": c.candidate_type.value if c.candidate_type else None
                }
            }
        
        elif tool_name == "generate_evidence_cards":
            job_id = str(arguments["job_id"]).strip()
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                # try to find by title as fallback
                job = db.query(Job).filter(Job.title.ilike(f"%{job_id}%")).order_by(Job.created_at.desc()).first()
                if job:
                    job_id = job.id
            if not job:
                return {"success": False, "error": f"Job not found with id: {job_id}"}
            
            task = generate_evidence_cards_task.delay(job_id)
            
            return {
                "success": True,
                "task_id": task.id,
                "message": f"Started generating evidence cards for '{job.title}'. Task ID: {task.id}"
            }
        
        elif tool_name == "check_task_status":
            from celery_app import celery_app
            
            task_id = arguments["task_id"]
            result = celery_app.AsyncResult(task_id)
            
            return {
                "success": True,
                "task_id": task_id,
                "status": result.status,
                "result": result.result if result.ready() else None
            }
        
        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}
    
    except Exception as e:
        return {"success": False, "error": str(e)}


async def chat_with_tools(messages: List[Dict], db: Session):
    """Chat with Grok using tool calling."""
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.x_ai_api_bearer_token}",
        "Content-Type": "application/json"
    }
    
    # add system prompt
    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    
    payload = {
        "model": "grok-4-1-fast-non-reasoning",
        "messages": full_messages,
        "tools": TOOLS,
        "tool_choice": "auto",
        "temperature": 0.7,
        "stream": True
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            if response.status_code != 200:
                error_text = await response.aread()
                yield f"data: {json.dumps({'error': f'API error: {response.status_code}'})}\n\n"
                return
            
            tool_calls = []
            current_tool_call = None
            content_buffer = ""
            
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                
                data = line[6:]
                if data == "[DONE]":
                    break
                
                try:
                    chunk = json.loads(data)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    
                    # handle content
                    if "content" in delta and delta["content"]:
                        content_buffer += delta["content"]
                        yield f"data: {json.dumps({'type': 'content', 'content': delta['content']})}\n\n"
                    
                    # handle tool calls
                    if "tool_calls" in delta:
                        for tc in delta["tool_calls"]:
                            idx = tc.get("index", 0)
                            
                            if tc.get("id"):
                                # new tool call
                                current_tool_call = {
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc.get("function", {}).get("name", ""),
                                        "arguments": tc.get("function", {}).get("arguments", "")
                                    }
                                }
                                if len(tool_calls) <= idx:
                                    tool_calls.append(current_tool_call)
                                else:
                                    tool_calls[idx] = current_tool_call
                            elif current_tool_call and tc.get("function", {}).get("arguments"):
                                # append to existing
                                current_tool_call["function"]["arguments"] += tc["function"]["arguments"]
                
                except json.JSONDecodeError:
                    continue
            
            # execute tool calls if any
            if tool_calls:
                print(f"[Chat] Executing {len(tool_calls)} tool calls: {[tc['function']['name'] for tc in tool_calls]}")
                yield f"data: {json.dumps({'type': 'tool_start', 'tools': [tc['function']['name'] for tc in tool_calls]})}\n\n"
                
                tool_results = []
                created_job_id = None  # track job ID from create_job
                
                for tc in tool_calls:
                    try:
                        args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                    except json.JSONDecodeError:
                        args = {}
                    
                    tool_name = tc["function"]["name"]
                    print(f"[Chat] Executing tool: {tool_name} with args: {args}")
                    
                    # if this is a sourcing call and we just created a job, use that job_id
                    if tool_name in ["start_sourcing", "start_github_sourcing"] and created_job_id:
                        if "job_id" not in args or not args.get("job_id"):
                            args["job_id"] = created_job_id
                            print(f"[Chat] Auto-injecting job_id: {created_job_id}")
                    
                    result = await execute_tool(tool_name, args, db)
                    
                    # track created job ID for subsequent calls
                    if tool_name == "create_job" and result.get("success") and result.get("job_id"):
                        created_job_id = result["job_id"]
                        print(f"[Chat] Captured created job_id: {created_job_id}")
                    
                    tool_results.append({
                        "tool_call_id": tc["id"],
                        "role": "tool",
                        "content": json.dumps(result)
                    })
                    
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'result': result})}\n\n"
                
                # continue conversation with tool results - handle potential follow-up tool calls
                follow_up_messages = full_messages + [
                    {"role": "assistant", "content": content_buffer if content_buffer else None, "tool_calls": tool_calls}
                ] + tool_results
                
                # loop to handle chained tool calls (e.g., create_job -> start_sourcing)
                max_follow_ups = 3  # prevent infinite loops
                for follow_up_round in range(max_follow_ups):
                    follow_up_payload = {
                        "model": "grok-4-1-fast-non-reasoning",
                        "messages": follow_up_messages,
                        "tools": TOOLS,
                        "tool_choice": "auto",
                        "temperature": 0.7,
                        "stream": True
                    }
                    
                    follow_up_tool_calls = []
                    follow_up_content = ""
                    current_follow_up_tool = None
                    
                    async with client.stream("POST", url, headers=headers, json=follow_up_payload) as follow_response:
                        if follow_response.status_code != 200:
                            break
                            
                        async for line in follow_response.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                
                                # handle content
                                if "content" in delta and delta["content"]:
                                    follow_up_content += delta["content"]
                                    yield f"data: {json.dumps({'type': 'content', 'content': delta['content']})}\n\n"
                                
                                # handle tool calls in follow-up
                                if "tool_calls" in delta:
                                    for tc in delta["tool_calls"]:
                                        idx = tc.get("index", 0)
                                        if tc.get("id"):
                                            current_follow_up_tool = {
                                                "id": tc["id"],
                                                "type": "function",
                                                "function": {
                                                    "name": tc.get("function", {}).get("name", ""),
                                                    "arguments": tc.get("function", {}).get("arguments", "")
                                                }
                                            }
                                            if len(follow_up_tool_calls) <= idx:
                                                follow_up_tool_calls.append(current_follow_up_tool)
                                            else:
                                                follow_up_tool_calls[idx] = current_follow_up_tool
                                        elif current_follow_up_tool and tc.get("function", {}).get("arguments"):
                                            current_follow_up_tool["function"]["arguments"] += tc["function"]["arguments"]
                            except json.JSONDecodeError:
                                continue
                    
                    # if no more tool calls, we're done
                    if not follow_up_tool_calls:
                        break
                    
                    # execute follow-up tool calls
                    print(f"[Chat] Follow-up round {follow_up_round + 1}: executing {len(follow_up_tool_calls)} tool calls: {[tc['function']['name'] for tc in follow_up_tool_calls]}")
                    yield f"data: {json.dumps({'type': 'tool_start', 'tools': [tc['function']['name'] for tc in follow_up_tool_calls]})}\n\n"
                    
                    follow_up_tool_results = []
                    for tc in follow_up_tool_calls:
                        try:
                            args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                        except json.JSONDecodeError:
                            args = {}
                        
                        tool_name = tc["function"]["name"]
                        print(f"[Chat] Follow-up executing tool: {tool_name} with args: {args}")
                        
                        # auto-inject job_id if we have one from earlier
                        if tool_name in ["start_sourcing", "start_github_sourcing"] and created_job_id:
                            if "job_id" not in args or not args.get("job_id"):
                                args["job_id"] = created_job_id
                                print(f"[Chat] Auto-injecting job_id: {created_job_id}")
                        
                        result = await execute_tool(tool_name, args, db)
                        
                        # track created job ID
                        if tool_name == "create_job" and result.get("success") and result.get("job_id"):
                            created_job_id = result["job_id"]
                            print(f"[Chat] Captured created job_id: {created_job_id}")
                        
                        follow_up_tool_results.append({
                            "tool_call_id": tc["id"],
                            "role": "tool",
                            "content": json.dumps(result)
                        })
                        
                        yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'result': result})}\n\n"
                    
                    # update messages for next round
                    follow_up_messages = follow_up_messages + [
                        {"role": "assistant", "content": follow_up_content if follow_up_content else None, "tool_calls": follow_up_tool_calls}
                    ] + follow_up_tool_results
            
            yield "data: [DONE]\n\n"


@router.post("/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Chat with Grok AI assistant with tool calling capabilities.
    Streams the response for real-time updates.
    """
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    
    return StreamingResponse(
        chat_with_tools(messages, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("")
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Non-streaming chat endpoint for simpler integrations.
    """
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    
    # collect all streamed content
    full_response = ""
    tool_results = []
    
    async for chunk in chat_with_tools(messages, db):
        if chunk.startswith("data: ") and chunk != "data: [DONE]\n\n":
            try:
                data = json.loads(chunk[6:])
                if data.get("type") == "content":
                    full_response += data.get("content", "")
                elif data.get("type") == "tool_result":
                    tool_results.append(data)
            except json.JSONDecodeError:
                pass
    
    return {
        "response": full_response,
        "tool_results": tool_results
    }


class TaskStatusRequest(BaseModel):
    task_ids: List[str] = Field(..., description="List of task IDs to check")


@router.post("/tasks/status")
async def get_tasks_status(request: TaskStatusRequest, db: Session = Depends(get_db)):
    """
    Check status of multiple Celery tasks.
    Returns detailed progress info for sourcing tasks.
    """
    from celery_app import celery_app
    
    results = {}
    for task_id in request.task_ids:
        try:
            result = celery_app.AsyncResult(task_id)
            task_info = {
                "task_id": task_id,
                "status": result.status,
                "ready": result.ready(),
                "successful": result.successful() if result.ready() else None,
            }
            
            # Get result or progress info
            if result.ready():
                task_info["result"] = result.result
            elif result.info and isinstance(result.info, dict):
                # Celery task can report progress via self.update_state
                task_info["progress"] = result.info
            
            # Determine stage based on status
            if result.status == "PENDING":
                task_info["stage"] = "queued"
                task_info["stage_label"] = "Queued"
                task_info["progress_percent"] = 5
            elif result.status == "STARTED":
                task_info["stage"] = "searching"
                task_info["stage_label"] = "Searching..."
                task_info["progress_percent"] = 20
            elif result.status == "PROGRESS":
                # Custom progress state
                info = result.info or {}
                task_info["stage"] = info.get("stage", "processing")
                task_info["stage_label"] = info.get("stage_label", "Processing...")
                task_info["progress_percent"] = info.get("progress", 50)
                task_info["details"] = info.get("details", {})
            elif result.status == "SUCCESS":
                task_info["stage"] = "complete"
                task_info["stage_label"] = "Complete"
                task_info["progress_percent"] = 100
            elif result.status == "FAILURE":
                task_info["stage"] = "failed"
                task_info["stage_label"] = "Failed"
                task_info["progress_percent"] = 0
                task_info["error"] = str(result.result) if result.result else "Unknown error"
            else:
                task_info["stage"] = "processing"
                task_info["stage_label"] = "Processing..."
                task_info["progress_percent"] = 50
            
            results[task_id] = task_info
        except Exception as e:
            results[task_id] = {
                "task_id": task_id,
                "status": "ERROR",
                "error": str(e),
                "stage": "error",
                "stage_label": "Error",
                "progress_percent": 0
            }
    
    return {"tasks": results}

