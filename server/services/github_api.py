import httpx
import re
from typing import List, Dict, Optional
from config import settings


class GitHubAPIClient:
    BASE_URL = "https://api.github.com"
    
    def __init__(self):
        self.token = settings.github_token
        self.headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"
        else:
            print("[GitHub API] WARNING: No GITHUB_TOKEN set. Rate limit: 60 requests/hour. Set GITHUB_TOKEN for 5000/hour.")
    
    async def search_users(
        self, 
        query: str,
        language: Optional[str] = None,
        location: Optional[str] = None,
        min_followers: int = 0,
        min_repos: int = 0,
        max_results: int = 30
    ) -> List[Dict]:
        """
        Search GitHub users by query with filters.
        
        Query can include:
        - Bio text: "machine learning engineer"
        - Skills: "pytorch tensorflow"
        
        Additional filters:
        - language: primary programming language
        - location: user location
        - min_followers: minimum follower count
        - min_repos: minimum public repos
        """
        # build search query
        search_parts = [query]
        
        if language:
            search_parts.append(f"language:{language}")
        if location:
            search_parts.append(f"location:{location}")
        if min_followers > 0:
            search_parts.append(f"followers:>={min_followers}")
        if min_repos > 0:
            search_parts.append(f"repos:>={min_repos}")
        
        search_parts.append("type:user")
        
        full_query = " ".join(search_parts)
        
        url = f"{self.BASE_URL}/search/users"
        params = {
            "q": full_query,
            "per_page": min(max_results, 100),
            "sort": "followers",
            "order": "desc"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"GitHub API error: {response.status_code} - {response.text[:200]}")
                return []
            
            data = response.json()
            return data.get("items", [])
    
    async def get_user_profile(self, username: str) -> Optional[Dict]:
        """Get detailed user profile including bio and social links."""
        url = f"{self.BASE_URL}/users/{username}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            
            if response.status_code != 200:
                print(f"GitHub API error getting user {username}: {response.status_code}")
                return None
            
            return response.json()
    
    async def get_user_repos(self, username: str, max_repos: int = 10) -> List[Dict]:
        """Get user's public repositories sorted by stars."""
        url = f"{self.BASE_URL}/users/{username}/repos"
        params = {
            "per_page": min(max_repos, 100),
            "sort": "pushed",
            "direction": "desc"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"GitHub API error getting repos for {username}: {response.status_code}")
                return []
            
            return response.json()
    
    async def get_user_languages(self, username: str, max_repos: int = 20) -> Dict[str, int]:
        """Get aggregated language stats across user's repos."""
        repos = await self.get_user_repos(username, max_repos)
        
        language_counts = {}
        for repo in repos:
            lang = repo.get("language")
            if lang:
                language_counts[lang] = language_counts.get(lang, 0) + 1
        
        # sort by count
        return dict(sorted(language_counts.items(), key=lambda x: x[1], reverse=True))
    
    def extract_x_username(self, user_profile: Dict) -> Optional[str]:
        """Extract X/Twitter username from GitHub profile."""
        # check twitter_username field (GitHub's official field)
        twitter = user_profile.get("twitter_username")
        if twitter:
            return twitter
        
        # check bio for twitter/x links
        bio = user_profile.get("bio") or ""
        blog = user_profile.get("blog") or ""
        
        # patterns to find twitter/x handles
        patterns = [
            r'(?:twitter\.com|x\.com)/(@?[\w]+)',
            r'@([\w]+)\s*(?:on\s+)?(?:twitter|x)',
            r'(?:twitter|x):\s*@?([\w]+)',
        ]
        
        for text in [bio, blog]:
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    username = match.group(1).lstrip('@')
                    # filter out common false positives
                    if username.lower() not in ['twitter', 'x', 'com', 'https', 'http']:
                        return username
        
        return None
    
    def extract_skills_from_bio(self, bio: str) -> List[str]:
        """Extract tech skills mentioned in bio."""
        if not bio:
            return []
        
        bio_lower = bio.lower()
        
        # common tech skills/keywords
        skill_keywords = [
            "python", "javascript", "typescript", "rust", "golang", "go", "java", "kotlin",
            "swift", "swiftui", "ios", "android", "react", "vue", "angular", "node",
            "django", "fastapi", "flask", "rails", "ruby",
            "machine learning", "ml", "deep learning", "ai", "nlp", "computer vision",
            "pytorch", "tensorflow", "keras", "scikit-learn",
            "aws", "gcp", "azure", "docker", "kubernetes", "k8s",
            "postgres", "mongodb", "redis", "elasticsearch",
            "frontend", "backend", "fullstack", "full-stack", "devops", "sre",
            "data science", "data engineer", "mlops"
        ]
        
        found_skills = []
        for skill in skill_keywords:
            if skill in bio_lower:
                found_skills.append(skill)
        
        return found_skills
    
    def calculate_developer_score(self, profile: Dict, repos: List[Dict]) -> int:
        """
        Calculate a score indicating how likely this is a real developer.
        Returns 0-100.
        """
        score = 50  # baseline
        
        # public repos
        public_repos = profile.get("public_repos", 0)
        if public_repos >= 10:
            score += 15
        elif public_repos >= 5:
            score += 10
        elif public_repos >= 1:
            score += 5
        
        # followers (but not too many - could be influencer)
        followers = profile.get("followers", 0)
        if 10 <= followers <= 5000:
            score += 10
        elif followers > 5000:
            score += 5  # might be more influencer than coder
        
        # has bio
        if profile.get("bio"):
            score += 5
        
        # has company
        if profile.get("company"):
            score += 5
        
        # repo quality signals
        total_stars = sum(r.get("stargazers_count", 0) for r in repos)
        if total_stars >= 100:
            score += 15
        elif total_stars >= 10:
            score += 10
        elif total_stars >= 1:
            score += 5
        
        # has recent activity (repos pushed recently)
        if repos and repos[0].get("pushed_at"):
            score += 5
        
        # negative signals
        bio = (profile.get("bio") or "").lower()
        negative_keywords = ["hiring", "recruiter", "hr", "talent", "job board"]
        for neg in negative_keywords:
            if neg in bio:
                score -= 20
        
        return max(0, min(100, score))
    
    async def get_full_developer_profile(self, username: str) -> Optional[Dict]:
        """
        Get comprehensive developer profile with all relevant data.
        Returns structured data ready for candidate creation.
        """
        profile = await self.get_user_profile(username)
        if not profile:
            return None
        
        repos = await self.get_user_repos(username, max_repos=15)
        languages = await self.get_user_languages(username)
        
        x_username = self.extract_x_username(profile)
        bio_skills = self.extract_skills_from_bio(profile.get("bio", ""))
        dev_score = self.calculate_developer_score(profile, repos)
        
        # get top repos for summary
        top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:5]
        
        return {
            "github_id": profile.get("id"),
            "github_username": profile.get("login"),
            "display_name": profile.get("name"),
            "bio": profile.get("bio"),
            "location": profile.get("location"),
            "company": profile.get("company"),
            "blog": profile.get("blog"),
            "email": profile.get("email"),
            "github_url": profile.get("html_url"),
            "avatar_url": profile.get("avatar_url"),
            "followers": profile.get("followers", 0),
            "following": profile.get("following", 0),
            "public_repos": profile.get("public_repos", 0),
            "x_username": x_username,
            "languages": languages,
            "bio_skills": bio_skills,
            "developer_score": dev_score,
            "top_repos": [
                {
                    "name": r.get("name"),
                    "description": r.get("description"),
                    "stars": r.get("stargazers_count", 0),
                    "language": r.get("language"),
                    "url": r.get("html_url")
                }
                for r in top_repos
            ],
            "created_at": profile.get("created_at"),
            "hireable": profile.get("hireable")
        }


github_client = GitHubAPIClient()

