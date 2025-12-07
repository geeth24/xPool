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

            # handle protobuf-style response with 'matches' attribute
            if hasattr(response, "matches"):
                for match in response.matches[:top_k]:
                    content = getattr(match, "chunk_content", "")
                    score = getattr(match, "score", 0.5)
                    candidate_id = self._extract_candidate_id(content)
                    if candidate_id:
                        results.append((candidate_id, score))
            # handle response with 'results' attribute
            elif hasattr(response, "results"):
                for result in response.results[:top_k]:
                    content = getattr(result, "content", "") or getattr(
                        result, "chunk_content", ""
                    )
                    score = getattr(result, "score", 0.5)
                    candidate_id = self._extract_candidate_id(content)
                    if candidate_id:
                        results.append((candidate_id, score))
            # handle dict response
            elif isinstance(response, dict):
                matches = response.get("matches", response.get("results", []))
                for match in matches[:top_k]:
                    content = match.get("chunk_content", match.get("content", ""))
                    score = match.get("score", 0.5)
                    candidate_id = self._extract_candidate_id(content)
                    if candidate_id:
                        results.append((candidate_id, score))
            else:
                print(f"[Collections] Unknown response format: {type(response)}")

            print(f"[Collections] Found {len(results)} matching candidates")
            return results

        except Exception as e:
            print(f"Error searching collections: {e}")
            import traceback

            traceback.print_exc()
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
    """
    Calculate match scores using Grok API scoring + learned pattern adjustments.

    🧠 SELF-IMPROVING: Applies learned preferences to adjust scores.
    """
    from services.grok_api import grok_client
    from services.memory import get_pattern_for_job, calculate_memory_adjusted_score

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.requirements:
            return

        # 🧠 Get learned pattern for this role
        learned_pattern = get_pattern_for_job(job_id)
        if learned_pattern and learned_pattern.get("confidence", 0) >= 0.2:
            print(
                f"[Scoring] 🧠 Applying learned pattern for {learned_pattern.get('role_type')} (confidence: {learned_pattern.get('confidence'):.0%})"
            )
        else:
            learned_pattern = None

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
                "grok_summary": candidate.grok_summary,
                "tweet_analysis": candidate.tweet_analysis,
            }

            # Get base score from Grok
            base_score = await grok_client.score_candidate_for_job(
                candidate_data, job.requirements
            )

            # 🧠 Apply learned pattern adjustments
            if learned_pattern:
                adjusted_score, adjustments = await calculate_memory_adjusted_score(
                    candidate, base_score, learned_pattern
                )
                jc.match_score = adjusted_score

                # Store adjustment info in evidence if available
                if jc.evidence and isinstance(jc.evidence, dict):
                    jc.evidence["_score_adjustments"] = adjustments
                    jc.evidence["_base_score"] = base_score
                    jc.evidence["_adjusted_score"] = adjusted_score

                if adjustments:
                    username = (
                        candidate.github_username or candidate.x_username or "unknown"
                    )
                    print(
                        f"[Scoring] {username}: {base_score:.0f} → {adjusted_score:.0f} ({', '.join(adjustments[:2])})"
                    )
            else:
                jc.match_score = base_score

        db.commit()
        print(
            f"[Scoring] Updated match scores for job {job_id} (pattern applied: {learned_pattern is not None})"
        )
    except Exception as e:
        print(f"Error calculating match scores: {e}")
        import traceback

        traceback.print_exc()
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
