// Types matching the FastAPI backend models

export enum JobStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  CLOSED = "closed",
}

export enum InterviewStage {
  NOT_REACHED_OUT = "not_reached_out",
  REACHED_OUT = "reached_out",
  PHONE_SCREEN = "phone_screen",
  STAGE_1 = "stage_1",
  STAGE_2 = "stage_2",
  FINAL = "final",
  OFFER = "offer",
  REJECTED = "rejected",
  HIRED = "hired",
}

export enum CandidateStatus {
  SOURCED = "sourced",
  SHORTLISTED = "shortlisted",
  INTERVIEWING = "interviewing",
  REJECTED = "rejected",
  HIRED = "hired",
}

export enum CandidateType {
  DEVELOPER = "developer",
  INFLUENCER = "influencer",
  RECRUITER = "recruiter",
  COMPANY = "company",
  BOT = "bot",
  UNKNOWN = "unknown",
}

// Search Strategy - AI-generated search parameters
export interface SearchStrategy {
  bio_keywords: string[]
  repo_topics: string[]
  languages: string[]
  location_suggestions: string[]
  negative_keywords: string[]
  seniority_signals?: {
    junior: string[]
    senior: string[]
    staff: string[]
  }
  role_type: string
}

// Job types
export interface JobCreate {
  title: string
  description?: string
  keywords: string[]
  requirements?: string
}

export interface JobUpdate {
  title?: string
  description?: string
  keywords?: string[]
  requirements?: string
  status?: JobStatus
}

export interface Job {
  id: string
  title: string
  description?: string
  keywords: string[]
  requirements?: string
  status: JobStatus
  search_strategy?: SearchStrategy
  created_at: string
  updated_at: string
}

// Candidate types
export interface Candidate {
  id: string
  // X identifiers (nullable for GitHub-only)
  x_user_id?: string
  x_username?: string
  // GitHub identifiers (nullable for X-only)
  github_id?: string
  github_username?: string
  display_name?: string
  bio?: string
  profile_url?: string
  followers_count: number
  following_count: number
  github_url?: string
  website_url?: string
  // contact info
  email?: string
  linkedin_url?: string
  phone?: string
  grok_summary?: string
  skills_extracted: string[]
  codeforces_rating?: number
  github_repos_count?: number
  years_experience?: number
  location?: string
  candidate_type?: CandidateType
  type_confidence?: number
  tweet_analysis?: Record<string, unknown>
  sourced_at: string
  updated_at: string
}

export interface CandidateUpdate {
  display_name?: string
  bio?: string
  github_url?: string
  website_url?: string
  grok_summary?: string
  skills_extracted?: string[]
  codeforces_rating?: number
  github_repos_count?: number
  years_experience?: number
  location?: string
}

// Evidence Card - shows WHY a candidate matches a job
export interface RelevantRepo {
  name: string
  relevance: string
  signals: string[]
}

export interface EvidenceCard {
  relevant_repos: RelevantRepo[]
  signals: string[]
  why_matched: string
  match_strength: "strong" | "moderate" | "weak" | "mismatch" | "unknown"
  green_flags: string[]
  red_flags: string[]
  suggested_questions: string[]
  outreach_hook: string
}

// Job-Candidate relationship
export interface JobCandidate {
  id: string
  job_id: string
  candidate_id: string
  status: CandidateStatus
  interview_stage: InterviewStage
  notes?: string
  match_score?: number
  evidence?: EvidenceCard  // AI-generated evidence card
  added_at: string
  updated_at: string
  candidate?: Candidate
}

// Recruiter action tracking
export interface RecruiterAction {
  action: "view" | "shortlist" | "contact" | "reject" | "hire"
  time_spent_seconds?: number
}

// Evidence feedback for learning
export interface EvidenceFeedbackCreate {
  feedback_type: "positive" | "negative"
  feedback_target?: string  // e.g. "green_flags", "red_flags", "signals", "questions", "outreach", "overall"
  comment?: string
}

export interface EvidenceFeedback {
  id: string
  job_id: string
  candidate_id: string
  feedback_type: "positive" | "negative"
  feedback_target?: string
  comment?: string
  created_at: string
}

// Candidate verification
export interface CandidateProof {
  type: "repo" | "project" | "blog" | "talk"
  url: string
  description?: string
}

export interface VerificationRequest {
  verification_method: "github_oauth" | "x_oauth" | "email"
  email?: string
  proofs: CandidateProof[]
  preferred_contact?: "email" | "x_dm" | "linkedin"
  open_to_opportunities?: 0 | 1 | 2  // 0=no, 1=yes, 2=passive
}

export interface VerificationStatus {
  candidate_id: string
  is_verified: 0 | 1 | 2  // 0=unverified, 1=pending, 2=verified
  verification_method?: string
  proofs: CandidateProof[]
  email?: string
  preferred_contact?: string
  open_to_opportunities: number
  verified_at?: string
}

export interface JobCandidateCreate {
  status?: CandidateStatus
  interview_stage?: InterviewStage
  notes?: string
}

export interface JobCandidateUpdate {
  status?: CandidateStatus
  interview_stage?: InterviewStage
  notes?: string
}

// Search types
export interface SearchFilters {
  interview_stage?: InterviewStage[]
  status?: CandidateStatus[]
  min_codeforces_rating?: number
  max_codeforces_rating?: number
  min_followers?: number
  min_years_experience?: number
  job_id?: string
  skills?: string[]
}

export interface CandidateSearchRequest {
  query?: string
  filters?: SearchFilters
  sort_by?: string
  sort_order?: "asc" | "desc"
  top_k?: number
}

export interface CandidateSearchResponse {
  candidates: Candidate[]
  total: number
  query?: string
}

// Sourcing types (X based - legacy)
export interface SourceRequest {
  max_results?: number
  regions?: string[]
  search_queries?: string[]
  exclude_influencers?: boolean
  min_tweets_analyzed?: number
}

export interface SourceResponse {
  message: string
  max_results: number
  regions?: string[]
  exclude_influencers: boolean
  task_id: string
}

// GitHub Sourcing types (primary method)
export interface GitHubSourceRequest {
  search_query: string
  language?: string
  location?: string
  skills?: string[]
  min_followers?: number
  min_repos?: number
  max_results?: number
  require_x_profile?: boolean
  min_dev_score?: number
}

export interface GitHubSourceResponse {
  message: string
  search_query: string
  language?: string
  location?: string
  max_results: number
  require_x_profile: boolean
  task_id: string
}

// Task status with progress
export interface TaskProgress {
  stage: "initializing" | "searching" | "analyzing" | "enriching" | "complete"
  stage_label: string
  progress: number
  details?: {
    job_id?: string
    job_title?: string
    query?: string
    keywords?: string[]
    users_found?: number
    candidates_found?: number
    candidates_analyzed?: number
    candidates_skipped?: number
    candidates_with_x?: number
    current_user?: string
    current_query?: string
  }
}

export interface TaskStatus {
  task_id: string
  status: "PENDING" | "STARTED" | "PROGRESS" | "SUCCESS" | "FAILURE" | "RETRY"
  result?: Record<string, unknown> | TaskProgress
}

// Stats for dashboard
export interface DashboardStats {
  total_candidates: number
  total_jobs: number
  sourced_today: number
  developer_accuracy: number
}

// 🧠 Learned Pattern - MemOS-style memory
export interface LearnedPattern {
  role_type: string
  successful_skills: string[]
  successful_signals: string[]
  successful_languages: string[]
  rejection_patterns: string[]
  avg_dev_score?: number
  avg_repo_count?: number
  preferred_candidate_types: string[]
  confidence: number
  hire_count: number
  shortlist_count: number
  reject_count: number
  total_actions: number
  updated_at?: string
}
