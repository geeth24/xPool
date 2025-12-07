import json
from typing import List, Optional, Tuple
from xai_sdk import Client

from config import settings
from database import SessionLocal, Job, Candidate, JobCandidate


class CollectionsService:
    """Service for managing candidate embeddings using xAI Collections."""
    
    def __init__(self):
        self.client = None
        self.collection_id = settings.xpool_collection_id
        self._init_client()
    
    def _init_client(self):
        """Initialize the xAI SDK client."""
        if settings.x_ai_api_bearer_token and settings.xai_management_api_key:
            self.client = Client(
                api_key=settings.x_ai_api_bearer_token,
                management_api_key=settings.xai_management_api_key,
                timeout=3600
            )
            print(f"xAI SDK client initialized with collection: {self.collection_id}")
        else:
            print(f"xAI SDK not initialized - api_key: {'SET' if settings.x_ai_api_bearer_token else 'NOT SET'}, management_key: {'SET' if settings.xai_management_api_key else 'NOT SET'}")
    
    async def ensure_collection_exists(self) -> Optional[str]:
        """Ensure the xPool collection exists, create if not."""
        if not self.client:
            print("xAI SDK client not initialized - missing API keys")
            return None
        
        if self.collection_id:
            return self.collection_id
        
        try:
            collection = self.client.collections.create(
                name="xPool Candidates"
            )
            self.collection_id = collection.id
            print(f"Created collection: {self.collection_id}")
            return self.collection_id
        except Exception as e:
            print(f"Error creating collection: {e}")
            return None
    
    def build_candidate_document(self, candidate: Candidate) -> str:
        """Build a text document from candidate data for embedding."""
        parts = []
        
        parts.append(f"Candidate ID: {candidate.id}")
        parts.append(f"Username: @{candidate.x_username}")
        
        if candidate.display_name:
            parts.append(f"Name: {candidate.display_name}")
        if candidate.bio:
            parts.append(f"Bio: {candidate.bio}")
        if candidate.grok_summary:
            parts.append(f"Summary: {candidate.grok_summary}")
        if candidate.skills_extracted:
            skills = candidate.skills_extracted if isinstance(candidate.skills_extracted, list) else []
            if skills:
                parts.append(f"Skills: {', '.join(skills)}")
        if candidate.location:
            parts.append(f"Location: {candidate.location}")
        if candidate.codeforces_rating:
            parts.append(f"Codeforces Rating: {candidate.codeforces_rating}")
        if candidate.years_experience:
            parts.append(f"Years Experience: {candidate.years_experience}")
        
        tweets = candidate.raw_tweets if isinstance(candidate.raw_tweets, list) else []
        if tweets:
            tweet_texts = [t.get("text", "") for t in tweets[:5] if isinstance(t, dict)]
            if tweet_texts:
                parts.append(f"Recent Posts: {' | '.join(tweet_texts)}")
        
        return "\n".join(parts)
    
    async def upload_candidate_document(self, candidate_id: str) -> Optional[str]:
        """Upload a candidate's profile as a document to the collection."""
        if not self.client:
            print("xAI client not initialized, skipping upload")
            return None
        
        collection_id = await self.ensure_collection_exists()
        if not collection_id:
            print("No collection ID, skipping upload")
            return None
        
        db = SessionLocal()
        try:
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                return None
            
            doc_content = self.build_candidate_document(candidate)
            doc_bytes = doc_content.encode('utf-8')
            
            # try different SDK methods
            try:
                document = self.client.collections.upload_document(
                    collection_id=collection_id,
                    name=f"candidate_{candidate.id}.txt",
                    data=doc_bytes
                )
                # handle different response formats
                doc_id = getattr(document, 'id', None) or getattr(document, 'document_id', None)
                if doc_id:
                    print(f"Uploaded document for candidate {candidate.x_username}: {doc_id}")
                    return doc_id
                else:
                    print(f"Uploaded document for {candidate.x_username} (no ID returned)")
                    return "uploaded"
            except AttributeError as ae:
                # SDK might return dict-like object
                if hasattr(document, '__getitem__'):
                    doc_id = document.get('id') or document.get('document_id')
                    print(f"Uploaded document for {candidate.x_username}: {doc_id}")
                    return doc_id
                print(f"Upload response format unknown: {type(document)}")
                return "uploaded"
            
        except Exception as e:
            # don't fail enrichment if upload fails
            print(f"Error uploading candidate document (non-fatal): {e}")
            return None
        finally:
            db.close()
    
    async def search_candidates(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """Search for candidates matching a query using semantic search."""
        if not self.client or not self.collection_id:
            print("Collections not configured - falling back to empty results")
            return []
        
        try:
            response = self.client.collections.search(
                query=query,
                collection_ids=[self.collection_id]
            )
            
            results = []
            for result in response.results[:top_k]:
                candidate_id = self._extract_candidate_id(result.content)
                if candidate_id:
                    results.append((candidate_id, result.score))
            
            return results
            
        except Exception as e:
            print(f"Error searching collections: {e}")
            return []
    
    def _extract_candidate_id(self, content: str) -> Optional[str]:
        """Extract candidate ID from document content."""
        for line in content.split('\n'):
            if line.startswith("Candidate ID:"):
                return line.replace("Candidate ID:", "").strip()
        return None


collections_service = CollectionsService()


async def generate_candidate_embedding(candidate_id: str):
    """Generate and store embedding for a candidate via Collections."""
    await collections_service.upload_candidate_document(candidate_id)


async def generate_job_embedding(job_id: str):
    """For jobs, we don't upload to collections - we use job requirements as search query."""
    pass


async def calculate_match_scores(job_id: str, candidate_id: str = None):
    """Calculate match scores using Grok API scoring instead of embeddings."""
    from services.grok_api import grok_client
    
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.requirements:
            return
        
        if candidate_id:
            job_candidates = db.query(JobCandidate).filter(
                JobCandidate.job_id == job_id,
                JobCandidate.candidate_id == candidate_id
            ).all()
        else:
            job_candidates = db.query(JobCandidate).filter(
                JobCandidate.job_id == job_id
            ).all()
        
        for jc in job_candidates:
            candidate = jc.candidate
            candidate_data = {
                "bio": candidate.bio,
                "skills_extracted": candidate.skills_extracted,
                "grok_summary": candidate.grok_summary
            }
            
            score = await grok_client.score_candidate_for_job(candidate_data, job.requirements)
            jc.match_score = score
        
        db.commit()
        print(f"Updated match scores for job {job_id}")
    except Exception as e:
        print(f"Error calculating match scores: {e}")
        db.rollback()
    finally:
        db.close()


async def find_similar_candidates(
    query_text: str,
    candidate_ids: List[str] = None,
    top_k: int = 10
) -> List[Tuple[str, float]]:
    """Find candidates similar to query text using Collections search."""
    results = await collections_service.search_candidates(query_text, top_k=top_k * 2)
    
    if candidate_ids:
        results = [(cid, score) for cid, score in results if cid in candidate_ids]
    
    return results[:top_k]
