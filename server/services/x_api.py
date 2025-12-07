import httpx
import re
from typing import List, Dict, Optional
from config import settings


class XAPIClient:
    BASE_URL = "https://api.x.com/2"
    
    def __init__(self):
        self.bearer_token = settings.x_api_bearer_token
        self.headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
    
    async def search_tweets(self, query: str, max_results: int = 20, use_full_archive: bool = False) -> List[Dict]:
        """
        Search for tweets matching the query and return tweet data with author info.
        If use_full_archive is True, calls /tweets/search/all (requires elevated access and higher quota).
        """
        endpoint = "all" if use_full_archive else "recent"
        if use_full_archive:
            print(f"[X API] Using FULL ARCHIVE search endpoint (/tweets/search/all)")
        url = f"{self.BASE_URL}/tweets/search/{endpoint}"
        params = {
            "query": query,
            "max_results": min(max_results, 100),
            "tweet.fields": "author_id,created_at,text,public_metrics",
            "expansions": "author_id",
            "user.fields": "id,name,username,description,profile_image_url,public_metrics,url,entities"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"X API error: {response.status_code} - {response.text}")
                return []
            
            data = response.json()
            
            if "data" not in data:
                return []
            
            tweets = data.get("data", [])
            users_data = {u["id"]: u for u in data.get("includes", {}).get("users", [])}
            
            results = []
            for tweet in tweets:
                author_id = tweet.get("author_id")
                user = users_data.get(author_id, {})
                results.append({
                    "tweet": tweet,
                    "user": user
                })
            
            return results
    
    async def search_users(self, query: str, max_results: int = 100) -> List[Dict]:
        """
        Search for users by query (searches bios, names, usernames).
        
        NOTE: This endpoint requires:
        1. Pro tier X API access (or higher)
        2. OAuth 1.0a User Context or OAuth 2.0 User Context authentication
           (NOT Bearer Token / Application-Only auth)
        
        Since we're using Bearer Token, this will return 403.
        We'll fall back to tweet search instead.
        
        This is the proper way to find developers by their profile info when you have the right auth.
        """
        url = f"{self.BASE_URL}/users/search"
        params = {
            "query": query,
            "max_results": min(max_results, 1000),
            "user.fields": "id,name,username,description,profile_image_url,public_metrics,url,entities,location,created_at"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code == 403:
                error_data = response.json() if response.text else {}
                error_detail = error_data.get("detail", "")
                if "OAuth 2.0 Application-Only" in error_detail or "OAuth 1.0a User Context" in error_detail:
                    print(f"X API Users Search requires User Context authentication (not Bearer Token). Status: 403")
                else:
                    print(f"X API Users Search requires Pro tier access. Status: 403")
                return []
            
            if response.status_code != 200:
                print(f"X API error searching users: {response.status_code} - {response.text[:200]}")
                return []
            
            data = response.json()
            return data.get("data", [])
    
    async def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user profile by username."""
        url = f"{self.BASE_URL}/users/by/username/{username}"
        params = {
            "user.fields": "id,name,username,description,profile_image_url,public_metrics,url,entities,location,created_at"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"X API error getting user: {response.status_code}")
                return None
            
            data = response.json()
            return data.get("data")
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user profile by ID."""
        url = f"{self.BASE_URL}/users/{user_id}"
        params = {
            "user.fields": "id,name,username,description,profile_image_url,public_metrics,url,entities,location,created_at"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"X API error getting user by ID: {response.status_code}")
                return None
            
            data = response.json()
            return data.get("data")
    
    async def get_user_tweets(self, user_id: str, max_results: int = 10) -> List[Dict]:
        """Get recent tweets from a user."""
        url = f"{self.BASE_URL}/users/{user_id}/tweets"
        params = {
            "max_results": min(max_results, 100),
            "tweet.fields": "created_at,text,public_metrics"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            
            if response.status_code != 200:
                print(f"X API error getting tweets: {response.status_code}")
                return []
            
            data = response.json()
            return data.get("data", [])
    
    def extract_urls_from_user(self, user: Dict) -> Dict[str, Optional[str]]:
        """Extract GitHub and website URLs from user profile."""
        github_url = None
        website_url = None
        
        bio = user.get("description", "") or ""
        
        github_patterns = [
            r'github\.com/([a-zA-Z0-9_-]+)',
            r'gh\.io/([a-zA-Z0-9_-]+)',
        ]
        for pattern in github_patterns:
            match = re.search(pattern, bio, re.IGNORECASE)
            if match:
                github_url = f"https://github.com/{match.group(1)}"
                break
        
        entities = user.get("entities", {})
        url_entity = entities.get("url", {})
        urls = url_entity.get("urls", [])
        
        for url_obj in urls:
            expanded_url = url_obj.get("expanded_url", "")
            if "github.com" in expanded_url.lower() and not github_url:
                github_url = expanded_url
            elif not website_url:
                website_url = expanded_url
        
        desc_urls = entities.get("description", {}).get("urls", [])
        for url_obj in desc_urls:
            expanded_url = url_obj.get("expanded_url", "")
            if "github.com" in expanded_url.lower() and not github_url:
                github_url = expanded_url
            elif not website_url:
                website_url = expanded_url
        
        return {
            "github_url": github_url,
            "website_url": website_url
        }
    
    def parse_user_to_candidate_data(self, user: Dict, tweets: List[Dict] = None) -> Dict:
        """Convert X API user data to candidate format."""
        urls = self.extract_urls_from_user(user)
        public_metrics = user.get("public_metrics", {})
        
        return {
            "x_user_id": user.get("id"),
            "x_username": user.get("username"),
            "display_name": user.get("name"),
            "bio": user.get("description"),
            "profile_url": f"https://x.com/{user.get('username')}",
            "followers_count": public_metrics.get("followers_count", 0),
            "following_count": public_metrics.get("following_count", 0),
            "github_url": urls.get("github_url"),
            "website_url": urls.get("website_url"),
            "location": user.get("location"),
            "raw_tweets": tweets or []
        }
    
    def quick_dev_score(self, user: Dict, tweet_text: str = "") -> int:
        """
        Quick heuristic scoring to prioritize likely developers.
        Returns 0-100 score. Higher = more likely to be a real developer.
        Use this to filter BEFORE expensive Grok API calls.
        """
        score = 50  # baseline
        bio = (user.get("description", "") or "").lower()
        username = (user.get("username", "") or "").lower()
        name = (user.get("name", "") or "").lower()
        tweet = tweet_text.lower()
        
        # Strong positive signals (developer indicators)
        dev_keywords = ["developer", "engineer", "dev", "programmer", "coder", "software", "backend", "frontend", "fullstack", "ios dev", "android dev", "web dev"]
        for kw in dev_keywords:
            if kw in bio:
                score += 15
                break
        
        # GitHub in bio is a strong signal
        if "github" in bio or "github.com" in bio:
            score += 20
        
        # Tech-specific terms in bio
        tech_terms = ["swift", "swiftui", "react", "python", "javascript", "typescript", "rust", "golang", "kotlin", "flutter", "node", "django", "fastapi", "aws", "docker", "kubernetes"]
        tech_count = sum(1 for t in tech_terms if t in bio)
        score += min(tech_count * 5, 20)
        
        # Negative signals (likely not a developer)
        negative_bio = ["influencer", "coach", "mentor", "tips", "advice", "follow for", "daily", "motivation", "crypto", "nft", "trading", "forex", "marketing", "seo", "growth", "viral"]
        for neg in negative_bio:
            if neg in bio:
                score -= 15
        
        # Bot/spam patterns
        if re.search(r'\d{5,}', username):  # lots of numbers in username
            score -= 20
        if "bot" in username or "news" in username or "job" in username:
            score -= 30
        
        # Tweet content signals
        if "github.com" in tweet or "pull request" in tweet or "merged" in tweet:
            score += 15
        if "#iosdev" in tweet or "#swiftui" in tweet or "#reactjs" in tweet or "#python" in tweet:
            score += 10
        if "i built" in tweet or "i shipped" in tweet or "working on" in tweet:
            score += 10
        
        # High follower but low following ratio often = influencer
        followers = user.get("public_metrics", {}).get("followers_count", 0)
        following = user.get("public_metrics", {}).get("following_count", 1)
        if followers > 50000 and following < 500:
            score -= 20  # likely influencer
        
        return max(0, min(100, score))


x_api_client = XAPIClient()

