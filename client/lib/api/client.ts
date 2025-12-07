import {
  Job,
  JobCreate,
  JobUpdate,
  Candidate,
  CandidateUpdate,
  JobCandidate,
  JobCandidateCreate,
  JobCandidateUpdate,
  GitHubSourceRequest,
  GitHubSourceResponse,
  TaskStatus,
  CandidateSearchRequest,
  CandidateSearchResponse,
  RecruiterAction,
  VerificationRequest,
  VerificationStatus,
  EvidenceFeedbackCreate,
  EvidenceFeedback,
  EvidenceCard,
  SearchStrategy,
  LearnedPattern,
} from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

// Jobs API
export const jobsApi = {
  list: (skip = 0, limit = 100) =>
    fetchApi<Job[]>(`/jobs?skip=${skip}&limit=${limit}`),

  get: (jobId: string) => fetchApi<Job>(`/jobs/${jobId}`),

  generate: (title: string) =>
    fetchApi<{
      title: string
      description: string
      keywords: string[]
      requirements: string
    }>("/jobs/generate", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  parse: (jobDescription: string) =>
    fetchApi<{
      title: string
      description: string
      keywords: string[]
      requirements: string
    }>("/jobs/parse", {
      method: "POST",
      body: JSON.stringify({ job_description: jobDescription }),
    }),

  create: (data: JobCreate) =>
    fetchApi<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (jobId: string, data: JobUpdate) =>
    fetchApi<Job>(`/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (jobId: string) =>
    fetchApi<{ message: string }>(`/jobs/${jobId}`, {
      method: "DELETE",
    }),

  sourceGitHub: (jobId: string, request: GitHubSourceRequest) =>
    fetchApi<GitHubSourceResponse>(`/jobs/${jobId}/source-github`, {
      method: "POST",
      body: JSON.stringify(request),
    }),

  enrich: (jobId: string) =>
    fetchApi<{ message: string; task_id: string }>(`/jobs/${jobId}/enrich`, {
      method: "POST",
    }),

  calculateScores: (jobId: string) =>
    fetchApi<{ message: string; task_id: string }>(
      `/jobs/${jobId}/calculate-scores`,
      { method: "POST" }
    ),

  getCandidates: (jobId: string, topK = 50, sortBy = "match_score") =>
    fetchApi<JobCandidate[]>(
      `/jobs/${jobId}/candidates?top_k=${topK}&sort_by=${sortBy}`
    ),

  getStats: (jobId: string) =>
    fetchApi<{
      job_id: string
      total_candidates: number
      scored_candidates: number
      avg_score: number | null
    }>(`/jobs/${jobId}/stats`),

  addCandidate: (jobId: string, candidateId: string, data: JobCandidateCreate) =>
    fetchApi<JobCandidate>(`/jobs/${jobId}/candidates/${candidateId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCandidate: (
    jobId: string,
    candidateId: string,
    data: JobCandidateUpdate
  ) =>
    fetchApi<JobCandidate>(`/jobs/${jobId}/candidates/${candidateId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  removeCandidate: (jobId: string, candidateId: string) =>
    fetchApi<{ message: string }>(`/jobs/${jobId}/candidates/${candidateId}`, {
      method: "DELETE",
    }),

  // Recruiter action tracking for self-improving ranking
  trackAction: (jobId: string, candidateId: string, action: RecruiterAction) =>
    fetchApi<{ id: string }>(`/jobs/${jobId}/candidates/${candidateId}/action`, {
      method: "POST",
      body: JSON.stringify(action),
    }),

  getRankingWeights: (jobId: string) =>
    fetchApi<{
      job_id: string
      total_actions: number
      positive_candidates: number
      negative_candidates: number
      weights: Record<string, number>
      message: string
    }>(`/jobs/${jobId}/ranking-weights`),

  generateEvidence: (jobId: string) =>
    fetchApi<{ message: string; candidates_to_process: number; task_id: string }>(
      `/jobs/${jobId}/generate-evidence`,
      { method: "POST" }
    ),

  // Evidence feedback for learning
  submitEvidenceFeedback: (
    jobId: string,
    candidateId: string,
    feedback: EvidenceFeedbackCreate
  ) =>
    fetchApi<EvidenceFeedback>(
      `/jobs/${jobId}/candidates/${candidateId}/evidence-feedback`,
      {
        method: "POST",
        body: JSON.stringify(feedback),
      }
    ),

  getEvidenceFeedback: (jobId: string, limit = 100) =>
    fetchApi<EvidenceFeedback[]>(
      `/jobs/${jobId}/evidence-feedback?limit=${limit}`
    ),

  regenerateEvidence: (jobId: string, candidateId: string) =>
    fetchApi<{
      message: string
      job_id: string
      candidate_id: string
      feedback_used: number
      evidence: EvidenceCard
    }>(`/jobs/${jobId}/candidates/${candidateId}/regenerate-evidence`, {
      method: "POST",
    }),

  // 🧠 Memory/Learning endpoints
  getLearnedPattern: (jobId: string) =>
    fetchApi<{
      job_id: string
      job_title: string
      role_type: string
      pattern: LearnedPattern | null
      message: string
    }>(`/jobs/${jobId}/memory`),

  getAllPatterns: () =>
    fetchApi<{
      patterns: LearnedPattern[]
      total_patterns: number
      message: string
    }>("/jobs/memory/patterns"),

  rebuildPatterns: () =>
    fetchApi<{
      message: string
      patterns_created: number
      actions_processed: number
    }>("/jobs/memory/rebuild", { method: "POST" }),

  // Search Strategy endpoints
  getSearchStrategy: (jobId: string) =>
    fetchApi<{
      job_id: string
      job_title: string
      search_strategy: SearchStrategy | null
      has_strategy: boolean
    }>(`/jobs/${jobId}/search-strategy`),

  generateSearchStrategy: (jobId: string) =>
    fetchApi<{
      job_id: string
      job_title: string
      search_strategy: SearchStrategy
      message: string
    }>(`/jobs/${jobId}/search-strategy/generate`, { method: "POST" }),

  updateSearchStrategy: (
    jobId: string,
    update: Partial<Pick<SearchStrategy, "bio_keywords" | "repo_topics" | "languages" | "location_suggestions" | "negative_keywords">>
  ) =>
    fetchApi<{
      job_id: string
      job_title: string
      search_strategy: SearchStrategy
      message: string
    }>(`/jobs/${jobId}/search-strategy`, {
      method: "PUT",
      body: JSON.stringify(update),
    }),
}

// Candidates API
export const candidatesApi = {
  list: (skip = 0, limit = 100, hasEmbedding?: boolean) => {
    let url = `/candidates?skip=${skip}&limit=${limit}`
    if (hasEmbedding !== undefined) {
      url += `&has_embedding=${hasEmbedding}`
    }
    return fetchApi<Candidate[]>(url)
  },

  get: (candidateId: string) =>
    fetchApi<Candidate>(`/candidates/${candidateId}`),

  update: (candidateId: string, data: CandidateUpdate) =>
    fetchApi<Candidate>(`/candidates/${candidateId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (candidateId: string) =>
    fetchApi<{ message: string }>(`/candidates/${candidateId}`, {
      method: "DELETE",
    }),

  enrich: (candidateId: string) =>
    fetchApi<{ message: string }>(`/candidates/${candidateId}/enrich`, {
      method: "POST",
    }),

  reclassify: (candidateId: string) =>
    fetchApi<{ message: string; task_id: string }>(
      `/candidates/${candidateId}/reclassify`,
      { method: "POST" }
    ),

  getByType: (candidateType: string, skip = 0, limit = 50) =>
    fetchApi<Candidate[]>(
      `/candidates/by-type/${candidateType}?skip=${skip}&limit=${limit}`
    ),

  search: (request: CandidateSearchRequest) =>
    fetchApi<CandidateSearchResponse>("/candidates/search", {
      method: "POST",
      body: JSON.stringify(request),
    }),

  getNotReachedOut: (jobId: string, topK = 20) =>
    fetchApi<Candidate[]>(
      `/candidates/by-job/${jobId}/not-reached-out?top_k=${topK}`
    ),

  getTopForJob: (jobId: string, topK = 10, minScore = 0) =>
    fetchApi<Candidate[]>(
      `/candidates/by-job/${jobId}/top?top_k=${topK}&min_score=${minScore}`
    ),

  // Verification/Claim flow
  getVerificationStatus: (candidateId: string) =>
    fetchApi<VerificationStatus>(`/candidates/${candidateId}/verification`),

  claimProfile: (candidateId: string, request: VerificationRequest) =>
    fetchApi<{ message: string; candidate_id: string; status: string }>(
      `/candidates/${candidateId}/claim`,
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    ),

  getVerifiedCandidates: (skip = 0, limit = 50) =>
    fetchApi<Candidate[]>(`/candidates/verified?skip=${skip}&limit=${limit}`),

  // Semantic Search & Find Similar
  findSimilar: (candidateId: string, topK = 10, jobId?: string) => {
    let url = `/candidates/${candidateId}/similar?top_k=${topK}`
    if (jobId) url += `&job_id=${jobId}`
    return fetchApi<{
      source_candidate: {
        id: string
        display_name: string
        github_username: string
      }
      similar_candidates: Array<{
        id: string
        display_name: string
        github_username: string
        x_username: string
        bio: string
        skills_extracted: string[]
        location: string
        similarity_score: number
        github_url: string
        profile_url: string
      }>
      total_found: number
    }>(url)
  },

  semanticSearch: (query: string, topK = 20, jobId?: string) => {
    const params = new URLSearchParams({ query, top_k: topK.toString() })
    if (jobId) params.append("job_id", jobId)
    return fetchApi<{
      query: string
      candidates: Array<{
        id: string
        display_name: string
        github_username: string
        x_username: string
        bio: string
        skills_extracted: string[]
        location: string
        relevance_score: number
        github_url: string
        profile_url: string
        grok_summary: string
      }>
      total_found: number
      job_filter: string | null
    }>(`/candidates/semantic-search?${params.toString()}`, { method: "POST" })
  },

  uploadToCollection: () =>
    fetchApi<{
      message: string
      uploaded: number
      errors: number
      total: number
    }>("/candidates/upload-to-collection", { method: "POST" }),
}

// Tasks API
export const tasksApi = {
  getStatus: (taskId: string) => fetchApi<TaskStatus>(`/tasks/${taskId}`),
}

// Health check
export const healthApi = {
  check: () => fetchApi<{ status: string }>("/health"),
}

// Chat API
export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export const chatApi = {
  // non-streaming chat
  send: (messages: ChatMessage[]) =>
    fetchApi<{ response: string; tool_results: unknown[] }>("/chat", {
      method: "POST",
      body: JSON.stringify({ messages, stream: false }),
    }),

  // streaming chat - returns a ReadableStream
  stream: async (messages: ChatMessage[]) => {
    const url = `${API_BASE_URL}/chat/stream`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: true }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.body
  },
}


