import httpx
import asyncio
import re
from typing import List, Dict, Optional, Set
from config import settings


class GitHubAPIClient:
    BASE_URL = "https://api.github.com"

    # role-specific search strategies
    ROLE_SEARCH_STRATEGIES = {
        "ios": {
            "bio_keywords": ["iOS", "Swift", "mobile developer", "iPhone", "Apple"],
            "languages": ["Swift", "Objective-C"],
            "repo_topics": ["ios", "swift", "swiftui", "uikit", "cocoapods"],
        },
        "android": {
            "bio_keywords": ["Android", "Kotlin", "mobile developer"],
            "languages": ["Kotlin", "Java"],
            "repo_topics": ["android", "kotlin", "jetpack-compose", "android-sdk"],
        },
        "frontend": {
            "bio_keywords": ["frontend", "front-end", "react", "vue", "web developer"],
            "languages": ["TypeScript", "JavaScript"],
            "repo_topics": ["react", "vue", "frontend", "nextjs", "typescript"],
        },
        "backend": {
            "bio_keywords": ["backend", "back-end", "server", "API", "microservices"],
            "languages": ["Python", "Go", "Java", "Rust"],
            "repo_topics": ["backend", "api", "microservices", "fastapi", "django"],
        },
        "fullstack": {
            "bio_keywords": ["fullstack", "full-stack", "full stack", "web developer"],
            "languages": ["TypeScript", "JavaScript", "Python"],
            "repo_topics": ["fullstack", "react", "nodejs", "nextjs"],
        },
        "ml_engineer": {
            "bio_keywords": [
                "machine learning",
                "ML",
                "AI",
                "deep learning",
                "data scientist",
            ],
            "languages": ["Python", "Jupyter Notebook"],
            "repo_topics": [
                "machine-learning",
                "deep-learning",
                "pytorch",
                "tensorflow",
                "llm",
            ],
        },
        "devops": {
            "bio_keywords": [
                "devops",
                "SRE",
                "infrastructure",
                "platform engineer",
                "cloud",
            ],
            "languages": ["Go", "Python", "Shell"],
            "repo_topics": [
                "kubernetes",
                "docker",
                "terraform",
                "devops",
                "infrastructure",
            ],
        },
        "data": {
            "bio_keywords": [
                "data engineer",
                "data engineering",
                "ETL",
                "data pipeline",
            ],
            "languages": ["Python", "SQL", "Scala"],
            "repo_topics": ["data-engineering", "spark", "airflow", "etl", "dbt"],
        },
    }

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

    def _detect_role_type(
        self, query: str, language: Optional[str] = None
    ) -> Optional[str]:
        """Detect role type from query string."""
        query_lower = query.lower()

        role_indicators = {
            "ios": ["ios", "swift", "swiftui", "uikit", "iphone", "apple developer"],
            "android": ["android", "kotlin", "jetpack"],
            "frontend": ["frontend", "front-end", "react", "vue", "angular"],
            "backend": ["backend", "back-end", "api", "server", "microservice"],
            "fullstack": ["fullstack", "full-stack", "full stack"],
            "ml_engineer": [
                "machine learning",
                "ml",
                "deep learning",
                "ai",
                "neural",
                "llm",
            ],
            "devops": ["devops", "sre", "kubernetes", "infrastructure", "platform"],
            "data": ["data engineer", "data pipeline", "etl", "spark", "airflow"],
        }

        for role, indicators in role_indicators.items():
            for indicator in indicators:
                if indicator in query_lower:
                    return role

        # try to detect from language
        if language:
            lang_lower = language.lower()
            if lang_lower in ["swift", "objective-c"]:
                return "ios"
            elif lang_lower == "kotlin":
                return "android"

        return None

    async def _search_users_single(
        self, query: str, max_results: int = 30, sort: str = "followers"
    ) -> List[Dict]:
        """Execute a single user search query."""
        url = f"{self.BASE_URL}/search/users"
        params = {
            "q": query,
            "per_page": min(max_results, 100),
            "sort": sort,
            "order": "desc",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers, params=params)

            if response.status_code != 200:
                print(
                    f"[GitHub API] Search error: {response.status_code} - {response.text[:200]}"
                )
                return []

            data = response.json()
            users = data.get("items", [])
            print(f"[GitHub API] Query '{query[:60]}...' returned {len(users)} users")
            return users

    async def _search_repos_for_contributors(
        self, topic: str, language: Optional[str] = None, max_repos: int = 10
    ) -> List[str]:
        """Search repos by topic and get unique contributor usernames."""
        url = f"{self.BASE_URL}/search/repositories"

        query_parts = [f"topic:{topic}"]
        if language:
            query_parts.append(f"language:{language}")
        query_parts.append("stars:>50")

        params = {
            "q": " ".join(query_parts),
            "per_page": min(max_repos, 30),
            "sort": "stars",
            "order": "desc",
        }

        usernames = set()

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers, params=params)

            if response.status_code != 200:
                print(f"[GitHub API] Repo search error: {response.status_code}")
                return []

            repos = response.json().get("items", [])

            for repo in repos[:5]:
                owner = repo.get("owner", {}).get("login")
                if owner and repo.get("owner", {}).get("type") == "User":
                    usernames.add(owner)

                # get top contributors
                contrib_url = (
                    f"{self.BASE_URL}/repos/{repo.get('full_name')}/contributors"
                )
                contrib_params = {"per_page": 5}

                try:
                    contrib_response = await client.get(
                        contrib_url, headers=self.headers, params=contrib_params
                    )
                    if contrib_response.status_code == 200:
                        contributors = contrib_response.json()
                        for contrib in contributors:
                            if contrib.get("type") == "User":
                                usernames.add(contrib.get("login"))
                except Exception as e:
                    print(f"[GitHub API] Error fetching contributors: {e}")
                    continue

        print(
            f"[GitHub API] Found {len(usernames)} users from repos with topic '{topic}'"
        )
        return list(usernames)

    async def search_users_comprehensive(
        self,
        query: str,
        language: Optional[str] = None,
        location: Optional[str] = None,
        min_followers: int = 0,
        min_repos: int = 0,
        max_results: int = 30,
        skills: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Comprehensive GitHub user search using multiple strategies:
        1. Bio-based user search with simplified queries
        2. Language-filtered user search
        3. Repository topic search to find active contributors
        4. Location-based search if specified

        This combines results from multiple approaches to find more relevant developers.
        """
        print(
            f"[GitHub API] Starting comprehensive search: query='{query}', language={language}, location={location}"
        )

        seen_usernames: Set[str] = set()
        all_users: List[Dict] = []

        # detect role type for targeted strategies
        role_type = self._detect_role_type(query, language)
        strategy = self.ROLE_SEARCH_STRATEGIES.get(role_type, {})

        print(f"[GitHub API] Detected role type: {role_type}")

        # STRATEGY 1: Simple bio-based searches with role keywords
        bio_queries = []

        # use role-specific bio keywords if available
        if strategy.get("bio_keywords"):
            for keyword in strategy["bio_keywords"][:3]:
                bio_queries.append(keyword)
        else:
            # fallback: use the main query terms separately
            query_words = query.split()[:3]
            bio_queries.extend(query_words)

        # build queries with filters
        for bio_keyword in bio_queries:
            query_parts = [bio_keyword, "type:user"]

            if min_followers > 0:
                query_parts.append(f"followers:>={min_followers}")
            if min_repos > 0:
                query_parts.append(f"repos:>={min_repos}")

            users = await self._search_users_single(
                " ".join(query_parts), max_results=30
            )
            for user in users:
                username = user.get("login")
                if username and username not in seen_usernames:
                    seen_usernames.add(username)
                    all_users.append(user)

            await asyncio.sleep(0.5)  # rate limit

        # STRATEGY 2: Location-based search if specified
        if location and location != "remote":
            location_clean = location.replace("_", " ")

            # map common location codes
            location_map = {
                "sf bay": "San Francisco",
                "sf_bay": "San Francisco",
                "nyc": "New York",
                "us": "United States",
                "uk": "United Kingdom",
            }
            location_search = location_map.get(location.lower(), location_clean)

            for bio_keyword in bio_queries[:2]:
                query_parts = [bio_keyword, f"location:{location_search}", "type:user"]
                if min_followers > 0:
                    query_parts.append(f"followers:>={min_followers}")

                users = await self._search_users_single(
                    " ".join(query_parts), max_results=20
                )
                for user in users:
                    username = user.get("login")
                    if username and username not in seen_usernames:
                        seen_usernames.add(username)
                        all_users.append(user)

                await asyncio.sleep(0.5)

        # STRATEGY 3: Search repos by topic and get contributors
        topics = strategy.get("repo_topics", [])
        if not topics and skills:
            # use skills as topics
            topics = [s.lower().replace(" ", "-") for s in skills[:3]]

        for topic in topics[:3]:
            repo_lang = (
                strategy.get("languages", [None])[0]
                if strategy.get("languages")
                else language
            )
            contributor_usernames = await self._search_repos_for_contributors(
                topic=topic, language=repo_lang, max_repos=5
            )

            # fetch user objects for these usernames
            for username in contributor_usernames:
                if username not in seen_usernames:
                    user_data = await self.get_user_profile(username)
                    if user_data:
                        # convert to search result format
                        all_users.append(
                            {
                                "login": user_data.get("login"),
                                "id": user_data.get("id"),
                                "avatar_url": user_data.get("avatar_url"),
                                "html_url": user_data.get("html_url"),
                                "type": "User",
                                "score": 0,  # no search score
                                "_source": "repo_contributor",
                            }
                        )
                        seen_usernames.add(username)

            await asyncio.sleep(0.5)

        # STRATEGY 4: Language-specific search
        search_languages = strategy.get("languages", [language] if language else [])
        for lang in search_languages[:2]:
            if lang:
                # search for users with this language in their profile
                query_parts = [f"language:{lang}", "type:user"]
                if min_followers > 0:
                    query_parts.append(f"followers:>={min_followers}")
                if min_repos > 0:
                    query_parts.append(f"repos:>={min_repos}")

                users = await self._search_users_single(
                    " ".join(query_parts), max_results=20
                )
                for user in users:
                    username = user.get("login")
                    if username and username not in seen_usernames:
                        seen_usernames.add(username)
                        all_users.append(user)

                await asyncio.sleep(0.5)

        print(f"[GitHub API] Comprehensive search found {len(all_users)} unique users")

        # return up to max_results
        return all_users[: max_results * 2]  # return extra for filtering

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
        Now uses comprehensive multi-strategy search for better results.

        Query can include:
        - Bio text: "machine learning engineer"
        - Skills: "pytorch tensorflow"

        Additional filters:
        - language: primary programming language
        - location: user location
        - min_followers: minimum follower count
        - min_repos: minimum public repos
        """
        return await self.search_users_comprehensive(
            query=query,
            language=language,
            location=location,
            min_followers=min_followers,
            min_repos=min_repos,
            max_results=max_results,
        )

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
        """Extract X username from GitHub profile."""
        # check twitter_username field (GitHub's official API field name)
        x_username = user_profile.get("twitter_username")
        if x_username:
            return x_username

        # check bio for X/twitter links
        bio = user_profile.get("bio") or ""
        blog = user_profile.get("blog") or ""

        # patterns to find X/twitter handles
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

    def extract_linkedin_url(self, user_profile: Dict) -> Optional[str]:
        """Extract LinkedIn URL from GitHub profile bio or blog."""
        bio = user_profile.get("bio") or ""
        blog = user_profile.get("blog") or ""

        patterns = [
            r"(https?://(?:www\.)?linkedin\.com/in/[\w-]+/?)",
            r"linkedin\.com/in/([\w-]+)",
        ]

        for text in [bio, blog]:
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    url = (
                        match.group(1)
                        if match.group(1).startswith("http")
                        else f"https://linkedin.com/in/{match.group(1)}"
                    )
                    return url

        return None

    def extract_contact_info(self, user_profile: Dict) -> Dict[str, Optional[str]]:
        """Extract all contact info from GitHub profile."""
        bio = user_profile.get("bio") or ""
        blog = user_profile.get("blog") or ""

        contact = {
            "email": user_profile.get("email"),  # github provides this if public
            "linkedin_url": self.extract_linkedin_url(user_profile),
            "phone": None,
        }

        # try to find email in bio if not in profile
        if not contact["email"]:
            email_pattern = r"[\w.+-]+@[\w-]+\.[\w.-]+"
            for text in [bio, blog]:
                match = re.search(email_pattern, text)
                if match:
                    contact["email"] = match.group(0)
                    break

        # try to find phone in bio (various formats)
        phone_patterns = [
            r"\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}",
            r"\+[0-9]{1,3}[-.\s]?[0-9]{6,12}",
        ]
        for text in [bio]:
            for pattern in phone_patterns:
                match = re.search(pattern, text)
                if match:
                    contact["phone"] = match.group(0).strip()
                    break
            if contact["phone"]:
                break

        return contact

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
        contact_info = self.extract_contact_info(profile)

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
            "email": contact_info.get("email"),
            "linkedin_url": contact_info.get("linkedin_url"),
            "phone": contact_info.get("phone"),
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
                    "url": r.get("html_url"),
                }
                for r in top_repos
            ],
            "created_at": profile.get("created_at"),
            "hireable": profile.get("hireable"),
        }


github_client = GitHubAPIClient()
