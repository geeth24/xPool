import httpx
import json
import re
from typing import Dict, List, Optional
from config import settings


class GrokAPIClient:
    BASE_URL = "https://api.x.ai/v1"
    
    def __init__(self):
        self.api_key = settings.x_ai_api_bearer_token
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def chat_completion(self, messages: List[Dict], model: str = "grok-4-1-fast-non-reasoning") -> Optional[str]:
        """Send a chat completion request to Grok API."""
        url = f"{self.BASE_URL}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.7
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=self.headers, json=payload)
            
            if response.status_code != 200:
                print(f"Grok API error: {response.status_code} - {response.text}")
                return None
            
            data = response.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content")
    
    async def analyze_candidate(self, candidate_data: Dict) -> Dict:
        """Analyze a candidate profile and extract structured information."""
        bio = candidate_data.get("bio", "") or ""
        tweets = candidate_data.get("raw_tweets", [])
        username = candidate_data.get("x_username", "")
        display_name = candidate_data.get("display_name", "")
        github_url = candidate_data.get("github_url", "")
        
        tweets_text = "\n".join([
            f"- {t.get('text', '')}" for t in tweets[:10]
        ]) if tweets else "No tweets available"
        
        prompt = f"""Analyze this candidate profile and extract relevant information for recruiting purposes.

Username: @{username}
Display Name: {display_name}
Bio: {bio}
GitHub: {github_url or "Not provided"}

Recent Tweets:
{tweets_text}

Please provide a JSON response with the following fields:
{{
    "summary": "A 2-3 sentence professional summary of this candidate",
    "skills": ["list", "of", "technical", "skills"],
    "years_experience": <estimated years of experience as integer or null>,
    "codeforces_rating": <if mentioned, integer rating, otherwise null>,
    "github_repos_count": <if inferable, integer, otherwise null>,
    "expertise_areas": ["main", "areas", "of", "expertise"],
    "hiring_potential": "high/medium/low based on profile quality"
}}

Only respond with valid JSON, no additional text."""

        messages = [
            {"role": "system", "content": "You are a technical recruiter assistant that analyzes candidate profiles. Always respond with valid JSON only."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        if not response:
            return {
                "summary": None,
                "skills": [],
                "years_experience": None,
                "codeforces_rating": None,
                "github_repos_count": None
            }
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "summary": parsed.get("summary"),
                    "skills": parsed.get("skills", []),
                    "years_experience": parsed.get("years_experience"),
                    "codeforces_rating": parsed.get("codeforces_rating"),
                    "github_repos_count": parsed.get("github_repos_count")
                }
        except json.JSONDecodeError:
            print(f"Failed to parse Grok response as JSON: {response[:200]}")
        
        return {
            "summary": response[:500] if response else None,
            "skills": [],
            "years_experience": None,
            "codeforces_rating": None,
            "github_repos_count": None
        }
    
    async def generate_candidate_summary(self, candidate_data: Dict) -> str:
        """Generate a professional summary for a candidate."""
        bio = candidate_data.get("bio", "") or ""
        tweets = candidate_data.get("raw_tweets", [])
        skills = candidate_data.get("skills_extracted", [])
        
        tweets_text = "\n".join([f"- {t.get('text', '')}" for t in tweets[:5]]) if tweets else ""
        skills_text = ", ".join(skills) if skills else "Not extracted yet"
        
        prompt = f"""Write a concise 2-3 sentence professional summary for this candidate:

Bio: {bio}
Skills: {skills_text}
Sample tweets: {tweets_text}

Focus on their technical expertise and potential value to employers."""

        messages = [
            {"role": "system", "content": "You are a professional recruiter writing candidate summaries."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        return response or "Summary not available."
    
    async def score_candidate_for_job(self, candidate_data: Dict, job_requirements: str) -> float:
        """Score how well a candidate matches job requirements (0-100)."""
        bio = candidate_data.get("bio", "") or ""
        skills = candidate_data.get("skills_extracted", [])
        summary = candidate_data.get("grok_summary", "") or ""
        
        # GitHub context (if available)
        gh_profile = candidate_data.get("tweet_analysis", {}).get("github_profile", {}) if isinstance(candidate_data.get("tweet_analysis"), dict) else {}
        gh_languages = gh_profile.get("languages", {}) or {}
        gh_dev_score = gh_profile.get("developer_score", None)
        gh_top_repos = gh_profile.get("top_repos", []) or []
        
        repos_text = ""
        for repo in gh_top_repos[:3]:
            repos_text += f"- {repo.get('name', '')}: {repo.get('description', '') or 'No description'} (⭐{repo.get('stars', 0)}, {repo.get('language', 'unknown')})\n"
        
        gh_block = f"""
GitHub evidence:
- Developer score: {gh_dev_score if gh_dev_score is not None else 'unknown'}
- Languages: {", ".join(list(gh_languages.keys())[:5]) if gh_languages else 'unknown'}
- Top repos:
{repos_text if repos_text else '- none found'}
""" if gh_profile else "GitHub evidence: none"
        
        prompt = f"""Rate how well this candidate matches the job requirements on a scale of 0-100.

CANDIDATE:
Bio: {bio}
Skills: {", ".join(skills) if skills else "Unknown"}
Summary: {summary}
{gh_block}

JOB REQUIREMENTS:
{job_requirements}

Respond with ONLY a number between 0 and 100, nothing else."""
        
        messages = [
            {"role": "system", "content": "You are a recruiter scoring candidate-job fit. Respond with only a number."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        if response:
            try:
                score = float(re.search(r'\d+', response).group())
                return min(100, max(0, score))
            except (ValueError, AttributeError):
                pass
        
        return 50.0

    async def classify_user_from_tweets(self, user_data: Dict, tweets: List[Dict]) -> Dict:
        """
        Deeply analyze user tweets to classify them as developer, influencer, recruiter, etc.
        This is the key function to filter out non-developers.
        """
        username = user_data.get("username", "")
        display_name = user_data.get("name", "")
        bio = user_data.get("description", "") or ""
        followers = user_data.get("public_metrics", {}).get("followers_count", 0)
        following = user_data.get("public_metrics", {}).get("following_count", 0)
        
        # format tweets for analysis
        tweets_formatted = []
        for t in tweets[:15]:
            text = t.get("text", "")
            metrics = t.get("public_metrics", {})
            likes = metrics.get("like_count", 0)
            retweets = metrics.get("retweet_count", 0)
            tweets_formatted.append(f"- {text} [Likes: {likes}, RTs: {retweets}]")
        
        tweets_text = "\n".join(tweets_formatted) if tweets_formatted else "No tweets available"
        
        prompt = f"""Analyze this X user's profile and tweets to classify them for recruiting purposes.

USERNAME: @{username}
DISPLAY NAME: {display_name}
BIO: {bio}
FOLLOWERS: {followers}
FOLLOWING: {following}

RECENT TWEETS (with engagement):
{tweets_text}

Based on their tweet CONTENT and patterns, classify this user. Look for:
- DEVELOPER: Shares code, discusses technical problems, talks about building/shipping, mentions specific technologies they USE (not just talk about)
- INFLUENCER: Primarily shares tips/advice, high engagement, content is educational/promotional, talks ABOUT tech but doesn't show they BUILD
- RECRUITER: Posts job listings, talks about hiring, company promotions
- COMPANY: Official company account, product announcements
- BOT: Repetitive patterns, automated content, job aggregation

Respond with JSON only:
{{
    "candidate_type": "developer|influencer|recruiter|company|bot",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation",
    "is_actively_coding": true/false,
    "tech_stack": ["technologies", "they", "actually", "use"],
    "red_flags": ["any", "concerns"],
    "green_flags": ["positive", "signals"],
    "tweet_themes": ["main", "topics", "they", "tweet", "about"],
    "engagement_pattern": "high_engagement_low_substance|genuine_technical|promotional|mixed",
    "recommendation": "source|skip|maybe",
    "estimated_seniority": "junior|mid|senior|lead|unknown"
}}"""

        messages = [
            {"role": "system", "content": "You are an expert technical recruiter who can identify real developers from their social media presence. Analyze tweet content deeply - look for evidence of actual coding work, not just tech talk. Be skeptical of high-follower accounts that only share tips without showing real work."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        default_result = {
            "candidate_type": "unknown",
            "confidence": 0.0,
            "reasoning": "Analysis failed",
            "is_actively_coding": False,
            "tech_stack": [],
            "red_flags": [],
            "green_flags": [],
            "tweet_themes": [],
            "engagement_pattern": "unknown",
            "recommendation": "skip",
            "estimated_seniority": "unknown"
        }
        
        if not response:
            return default_result
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "candidate_type": parsed.get("candidate_type", "unknown"),
                    "confidence": float(parsed.get("confidence", 0)),
                    "reasoning": parsed.get("reasoning", ""),
                    "is_actively_coding": parsed.get("is_actively_coding", False),
                    "tech_stack": parsed.get("tech_stack", []),
                    "red_flags": parsed.get("red_flags", []),
                    "green_flags": parsed.get("green_flags", []),
                    "tweet_themes": parsed.get("tweet_themes", []),
                    "engagement_pattern": parsed.get("engagement_pattern", "unknown"),
                    "recommendation": parsed.get("recommendation", "skip"),
                    "estimated_seniority": parsed.get("estimated_seniority", "unknown")
                }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse classification response: {e}")
        
        return default_result

    async def generate_search_queries(self, job_title: str, keywords: List[str], regions: List[str] = None) -> List[str]:
        """Generate smart X search queries to find real developers - targeting people who SHARE CODE."""
        
        # Build highly targeted queries that find developers sharing their work
        # Key insight: real devs share code, repos, PRs, bugs they fixed
        queries = []
        
        primary_tech = keywords[0] if keywords else "code"
        secondary_tech = keywords[1] if len(keywords) > 1 else ""
        
        # Query 1: GitHub activity - people sharing repos/PRs
        github_query = f'(github.com OR "pull request" OR "merged PR" OR "my repo") ({primary_tech}) -is:retweet -hiring -job lang:en'
        queries.append(github_query)
        
        # Query 2: Code sharing - actual code discussions
        code_query = f'({primary_tech}) ("fixed a bug" OR "debugging" OR "refactored" OR "implemented") -is:retweet -hiring lang:en'
        queries.append(code_query)
        
        # Query 3: Project shipping - people who ship
        ship_query = f'({primary_tech}) ("just shipped" OR "launched" OR "released" OR "deployed") ("my app" OR "my project" OR "side project") -is:retweet -hiring lang:en'
        queries.append(ship_query)
        
        # Query 4: Learning in public - devs sharing progress  
        learning_query = f'({primary_tech}) ("TIL" OR "learned" OR "figured out" OR "finally got") (code OR programming OR dev) -is:retweet -hiring lang:en'
        queries.append(learning_query)
        
        # Query 5: Tech-specific hashtags with builder intent
        if "iOS" in keywords or "Swift" in keywords or "SwiftUI" in keywords:
            hashtag_query = f'(#iosdev OR #swiftui OR #swiftlang) ("built" OR "building" OR "working on" OR "shipped") -is:retweet -hiring lang:en'
        elif "React" in keywords or "JavaScript" in keywords or "TypeScript" in keywords:
            hashtag_query = f'(#reactjs OR #javascript OR #typescript) ("built" OR "building" OR "shipped") -is:retweet -hiring lang:en'
        elif "Python" in keywords:
            hashtag_query = f'(#python OR #django OR #fastapi) ("built" OR "building" OR "shipped") -is:retweet -hiring lang:en'
        else:
            hashtag_query = f'(#coding OR #programming OR #developer) ({primary_tech}) ("I built" OR "working on") -is:retweet -hiring lang:en'
        queries.append(hashtag_query)
        
        # Query 6: Open source contributors
        oss_query = f'({primary_tech}) ("open source" OR "OSS" OR "contributor" OR "maintainer") -is:retweet -hiring -job lang:en'
        queries.append(oss_query)
        
        return queries

    async def generate_evidence_card(self, candidate_data: Dict, job_data: Dict, learned_pattern: Dict = None) -> Dict:
        """
        Generate an evidence card explaining WHY this candidate matches the job.
        This is the killer feature - showing recruiters concrete proof.
        
        🧠 SELF-IMPROVING: If learned_pattern is provided, uses it to improve analysis.
        """
        # Extract candidate info - handle None values safely
        tweet_analysis = candidate_data.get("tweet_analysis") or {}
        github_profile = tweet_analysis.get("github_profile") or {}
        top_repos = github_profile.get("top_repos") or []
        languages = github_profile.get("languages") or {}
        dev_score = github_profile.get("developer_score") or 0
        
        bio = candidate_data.get("bio") or ""
        skills = candidate_data.get("skills_extracted") or []
        tweets = candidate_data.get("raw_tweets") or []
        x_classification = tweet_analysis.get("x_classification") or {}
        
        # Extract job info
        job_title = job_data.get("title", "")
        job_keywords = job_data.get("keywords", [])
        job_requirements = job_data.get("requirements", "") or ""
        
        # Format repos for prompt
        repos_text = ""
        if top_repos:
            for repo in top_repos[:5]:
                repo_name = repo.get('name') or 'Unknown'
                repo_desc = (repo.get('description') or 'No description')[:100]
                repo_stars = repo.get('stars') or 0
                repo_lang = repo.get('language') or 'Unknown'
                repos_text += f"- {repo_name}: {repo_desc} (⭐{repo_stars}, {repo_lang})\n"
        
        # Format languages
        lang_text = ", ".join([f"{lang}" for lang in list(languages.keys())[:5]]) if languages else "Unknown"
        
        # Format tweets
        tweets_text = ""
        if tweets:
            for t in tweets[:5]:
                tweet_text = (t.get('text') or '')[:150]
                tweets_text += f"- {tweet_text}\n"
        tweets_text = tweets_text or "No tweets"
        
        # 🧠 Format learned pattern for injection
        pattern_context = ""
        if learned_pattern and learned_pattern.get("confidence", 0) >= 0.2:
            from services.memory import format_pattern_for_prompt
            pattern_context = format_pattern_for_prompt(learned_pattern)
        
        prompt = f"""You are a technical recruiter analyzing a candidate for a specific role. Generate an "Evidence Card" that explains WHY this candidate is a good (or bad) match.
{pattern_context}

JOB DETAILS:
- Title: {job_title}
- Keywords: {', '.join(job_keywords)}
- Requirements: {job_requirements[:500]}

CANDIDATE PROFILE:
- Bio: {bio}
- Skills: {', '.join(skills[:10])}
- Languages: {lang_text}
- Developer Score: {dev_score}/100
- Top Repositories:
{repos_text}
- Recent Tweets:
{tweets_text}

Generate a JSON evidence card with:
1. relevant_repos: Top 3 repos that are MOST relevant to this specific job (with why they matter)
2. signals: Specific technical signals found (e.g., "CUDA experience in repo X", "Performance optimization commits", "Compiler work")
3. why_matched: 2-3 sentence explanation of why this candidate fits THIS role specifically
4. match_strength: "strong" | "moderate" | "weak" | "mismatch"
5. green_flags: Positive signals specific to this role
6. red_flags: Concerns or gaps for this role
7. suggested_questions: 2-3 interview questions based on their background
8. outreach_hook: A personalized opening line for reaching out that references their specific work

Respond with JSON only:
{{
    "relevant_repos": [
        {{"name": "repo-name", "relevance": "Why this repo matters for the role", "signals": ["specific", "technical", "signals"]}}
    ],
    "signals": ["CUDA files found", "ML pipeline experience", "etc"],
    "why_matched": "This candidate matches because...",
    "match_strength": "strong|moderate|weak|mismatch",
    "green_flags": ["Has production ML experience", "etc"],
    "red_flags": ["No distributed systems experience", "etc"],
    "suggested_questions": ["Ask about their approach to X", "etc"],
    "outreach_hook": "Hey, I saw your work on X and was impressed by..."
}}"""

        messages = [
            {"role": "system", "content": "You are an expert technical recruiter who deeply understands both the technical requirements of roles and how to evaluate candidate evidence. Be specific and concrete - cite actual repos, commits, or tweets as evidence."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        default_result = {
            "relevant_repos": [],
            "signals": [],
            "why_matched": "Unable to generate match explanation",
            "match_strength": "unknown",
            "green_flags": [],
            "red_flags": [],
            "suggested_questions": [],
            "outreach_hook": ""
        }
        
        if not response:
            return default_result
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "relevant_repos": parsed.get("relevant_repos", []),
                    "signals": parsed.get("signals", []),
                    "why_matched": parsed.get("why_matched", ""),
                    "match_strength": parsed.get("match_strength", "unknown"),
                    "green_flags": parsed.get("green_flags", []),
                    "red_flags": parsed.get("red_flags", []),
                    "suggested_questions": parsed.get("suggested_questions", []),
                    "outreach_hook": parsed.get("outreach_hook", "")
                }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse evidence card response: {e}")
        
        return default_result


    async def generate_evidence_card_with_feedback(
        self, 
        candidate_data: Dict, 
        job_data: Dict, 
        feedback_examples: List[Dict]
    ) -> Dict:
        """
        Generate an evidence card with learning from past feedback.
        Uses feedback examples to improve the quality of evidence generation.
        """
        # Extract candidate info
        tweet_analysis = candidate_data.get("tweet_analysis") or {}
        github_profile = tweet_analysis.get("github_profile") or {}
        top_repos = github_profile.get("top_repos") or []
        languages = github_profile.get("languages") or {}
        dev_score = github_profile.get("developer_score") or 0
        
        bio = candidate_data.get("bio") or ""
        skills = candidate_data.get("skills_extracted") or []
        tweets = candidate_data.get("raw_tweets") or []
        
        # Extract job info
        job_title = job_data.get("title", "")
        job_keywords = job_data.get("keywords", [])
        job_requirements = job_data.get("requirements", "") or ""
        
        # Format repos
        repos_text = ""
        if top_repos:
            for repo in top_repos[:5]:
                repo_name = repo.get('name') or 'Unknown'
                repo_desc = (repo.get('description') or 'No description')[:100]
                repo_stars = repo.get('stars') or 0
                repo_lang = repo.get('language') or 'Unknown'
                repos_text += f"- {repo_name}: {repo_desc} (⭐{repo_stars}, {repo_lang})\n"
        
        lang_text = ", ".join([f"{lang}" for lang in list(languages.keys())[:5]]) if languages else "Unknown"
        
        tweets_text = ""
        if tweets:
            for t in tweets[:5]:
                tweet_text = (t.get('text') or '')[:150]
                tweets_text += f"- {tweet_text}\n"
        tweets_text = tweets_text or "No tweets"
        
        # Build feedback context
        feedback_context = ""
        if feedback_examples:
            positive_examples = [f for f in feedback_examples if f.get("feedback_type") == "positive"]
            negative_examples = [f for f in feedback_examples if f.get("feedback_type") == "negative"]
            
            feedback_context = "\n\n=== LEARNING FROM PAST FEEDBACK ===\n"
            
            if positive_examples:
                feedback_context += "\nEXAMPLES OF GOOD EVIDENCE (recruiters liked these):\n"
                for ex in positive_examples[:3]:
                    ev = ex.get("evidence", {})
                    target = ex.get("feedback_target", "overall")
                    comment = ex.get("comment", "")
                    feedback_context += f"- Target: {target}"
                    if comment:
                        feedback_context += f", Comment: {comment}"
                    feedback_context += f"\n  Match strength: {ev.get('match_strength', 'N/A')}\n"
                    feedback_context += f"  Why matched: {ev.get('why_matched', 'N/A')[:200]}\n"
            
            if negative_examples:
                feedback_context += "\nEXAMPLES OF BAD EVIDENCE (recruiters disliked these - AVOID):\n"
                for ex in negative_examples[:3]:
                    ev = ex.get("evidence", {})
                    target = ex.get("feedback_target", "overall")
                    comment = ex.get("comment", "")
                    feedback_context += f"- Target: {target}"
                    if comment:
                        feedback_context += f", Issue: {comment}"
                    feedback_context += f"\n  Match strength: {ev.get('match_strength', 'N/A')}\n"
                    feedback_context += f"  Why matched: {ev.get('why_matched', 'N/A')[:200]}\n"
            
            feedback_context += "\nUSE THIS FEEDBACK TO IMPROVE YOUR EVIDENCE GENERATION.\n"
            feedback_context += "- If positive feedback mentioned specific aspects, emphasize similar approaches\n"
            feedback_context += "- If negative feedback mentioned issues, avoid those patterns\n"
        
        prompt = f"""You are a technical recruiter analyzing a candidate for a specific role. Generate an "Evidence Card" that explains WHY this candidate is a good (or bad) match.
{feedback_context}

JOB DETAILS:
- Title: {job_title}
- Keywords: {', '.join(job_keywords)}
- Requirements: {job_requirements[:500]}

CANDIDATE PROFILE:
- Bio: {bio}
- Skills: {', '.join(skills[:10])}
- Languages: {lang_text}
- Developer Score: {dev_score}/100
- Top Repositories:
{repos_text}
- Recent Tweets:
{tweets_text}

Generate a JSON evidence card with:
1. relevant_repos: Top 3 repos that are MOST relevant to this specific job (with why they matter)
2. signals: Specific technical signals found (e.g., "CUDA experience in repo X", "Performance optimization commits", "Compiler work")
3. why_matched: 2-3 sentence explanation of why this candidate fits THIS role specifically
4. match_strength: "strong" | "moderate" | "weak" | "mismatch"
5. green_flags: Positive signals specific to this role
6. red_flags: Concerns or gaps for this role
7. suggested_questions: 2-3 interview questions based on their background
8. outreach_hook: A personalized opening line for reaching out that references their specific work

Respond with JSON only:
{{
    "relevant_repos": [
        {{"name": "repo-name", "relevance": "Why this repo matters for the role", "signals": ["specific", "technical", "signals"]}}
    ],
    "signals": ["CUDA files found", "ML pipeline experience", "etc"],
    "why_matched": "This candidate matches because...",
    "match_strength": "strong|moderate|weak|mismatch",
    "green_flags": ["Has production ML experience", "etc"],
    "red_flags": ["No distributed systems experience", "etc"],
    "suggested_questions": ["Ask about their approach to X", "etc"],
    "outreach_hook": "Hey, I saw your work on X and was impressed by..."
}}"""

        messages = [
            {"role": "system", "content": "You are an expert technical recruiter who deeply understands both the technical requirements of roles and how to evaluate candidate evidence. Be specific and concrete - cite actual repos, commits, or tweets as evidence. Learn from the feedback provided to improve your evidence quality."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        default_result = {
            "relevant_repos": [],
            "signals": [],
            "why_matched": "Unable to generate match explanation",
            "match_strength": "unknown",
            "green_flags": [],
            "red_flags": [],
            "suggested_questions": [],
            "outreach_hook": ""
        }
        
        if not response:
            return default_result
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "relevant_repos": parsed.get("relevant_repos", []),
                    "signals": parsed.get("signals", []),
                    "why_matched": parsed.get("why_matched", ""),
                    "match_strength": parsed.get("match_strength", "unknown"),
                    "green_flags": parsed.get("green_flags", []),
                    "red_flags": parsed.get("red_flags", []),
                    "suggested_questions": parsed.get("suggested_questions", []),
                    "outreach_hook": parsed.get("outreach_hook", "")
                }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse evidence card response: {e}")
        
        return default_result

    async def generate_search_strategy(self, job_title: str, job_description: str = "", keywords: List[str] = None, requirements: str = "") -> Dict:
        """
        Generate an optimized GitHub search strategy for a job.
        Returns bio keywords, repo topics, languages, and location suggestions.
        """
        keywords_text = ", ".join(keywords) if keywords else "None provided"
        
        prompt = f"""Generate an optimized GitHub search strategy for finding candidates for this role.

Job Title: {job_title}
Description: {job_description[:500] if job_description else "Not provided"}
Keywords: {keywords_text}
Requirements: {requirements[:500] if requirements else "Not provided"}

I need search terms optimized for GitHub's search API. GitHub user search looks at bios and profiles, NOT code.

Provide a JSON response with:
{{
    "bio_keywords": ["5-8 keywords to search in user bios, e.g. 'iOS developer', 'Swift', 'mobile engineer'"],
    "repo_topics": ["5-8 GitHub repo topics to find contributors, e.g. 'ios', 'swiftui', 'react', 'machine-learning'"],
    "languages": ["2-3 primary programming languages for this role"],
    "location_suggestions": ["3-5 tech hub locations where these developers are common"],
    "negative_keywords": ["keywords that indicate NOT a good fit, e.g. 'recruiter', 'hiring manager'"],
    "seniority_signals": {{
        "junior": ["signals for junior developers"],
        "senior": ["signals for senior developers"],
        "staff": ["signals for staff+ engineers"]
    }},
    "role_type": "detected role type like 'ios', 'backend', 'ml_engineer', 'frontend', etc."
}}

Be specific and practical. Use lowercase for topics (GitHub convention). Only respond with valid JSON."""

        messages = [
            {"role": "system", "content": "You are a technical recruiting expert who understands GitHub search optimization. Generate practical search strategies."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.chat_completion(messages)
        
        default_result = {
            "bio_keywords": [job_title],
            "repo_topics": [],
            "languages": [],
            "location_suggestions": ["San Francisco", "New York", "Seattle", "Austin", "Remote"],
            "negative_keywords": ["recruiter", "hiring", "hr"],
            "seniority_signals": {
                "junior": ["learning", "student", "bootcamp"],
                "senior": ["lead", "architect", "10+ years"],
                "staff": ["staff", "principal", "distinguished"]
            },
            "role_type": "unknown"
        }
        
        if not response:
            return default_result
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "bio_keywords": parsed.get("bio_keywords", default_result["bio_keywords"]),
                    "repo_topics": parsed.get("repo_topics", []),
                    "languages": parsed.get("languages", []),
                    "location_suggestions": parsed.get("location_suggestions", default_result["location_suggestions"]),
                    "negative_keywords": parsed.get("negative_keywords", default_result["negative_keywords"]),
                    "seniority_signals": parsed.get("seniority_signals", default_result["seniority_signals"]),
                    "role_type": parsed.get("role_type", "unknown")
                }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to parse search strategy response: {e}")
        
        return default_result


grok_client = GrokAPIClient()

