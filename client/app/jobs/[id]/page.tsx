"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { jobsApi, Job, JobCandidate, GitHubSourceRequest, CandidateStatus } from "@/lib/api"
// Badge not needed in simplified design
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { toast } from "sonner"
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Loader2,
  CheckCircle,
  Github,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  Mail,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { EvidenceCard, EvidenceFeedbackCreate } from "@/lib/api/types"
import { ThumbsUp, ThumbsDown } from "lucide-react"

type PipelineStage = "all" | "sourced" | "shortlisted" | "interviewing" | "rejected"

// inline feedback item for evidence
interface EvidenceItemProps {
  content: string
  itemType: string
  itemIndex: number
  jobId: string
  candidateId: string
  variant: "green" | "red" | "neutral"
}

function EvidenceItemWithFeedback({ content, itemType, itemIndex, jobId, candidateId, variant }: EvidenceItemProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: "positive" | "negative") => {
    setIsSubmitting(true)
    try {
      const feedbackData: EvidenceFeedbackCreate = {
        feedback_type: type,
        feedback_target: itemType,
        comment: `Item ${itemIndex + 1}: ${content.substring(0, 100)}`,
      }
      await jobsApi.submitEvidenceFeedback(jobId, candidateId, feedbackData)
      setFeedback(type)
    } catch {
      toast.error("Failed to submit feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  const variantStyles = {
    green: { text: "text-green-500", prefix: "+" },
    red: { text: "text-red-500", prefix: "-" },
    neutral: { text: "text-amber-500", prefix: "•" },
  }

  return (
    <li className="text-xs text-foreground flex items-start gap-1 group">
      <span className={`${variantStyles[variant].text} mt-0.5 shrink-0`}>{variantStyles[variant].prefix}</span>
      <span className="flex-1">{content}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {feedback ? (
          <span className="text-[10px] text-muted-foreground">
            {feedback === "positive" ? "👍" : "👎"}
          </span>
        ) : (
          <>
            <button
              onClick={() => handleFeedback("positive")}
              disabled={isSubmitting}
              className="p-0.5 rounded hover:bg-green-500/20 text-muted-foreground hover:text-green-500 transition-colors"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
            </button>
            <button
              onClick={() => handleFeedback("negative")}
              disabled={isSubmitting}
              className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
            </button>
          </>
        )}
      </div>
    </li>
  )
}

interface CandidateCardProps {
  jc: JobCandidate
  jobId: string
  onAction: () => void
}

function CandidateCard({ jc, jobId, onAction }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [currentEvidence, setCurrentEvidence] = useState<EvidenceCard | null>(jc.evidence as unknown as EvidenceCard | null)
  const candidate = jc.candidate
  if (!candidate) return null

  const githubProfile = candidate.tweet_analysis?.github_profile as {
    username?: string
    public_repos?: number
    followers?: number
    languages?: Record<string, number>
    top_repos?: Array<{ name: string; description?: string; stars: number; language?: string }>
    developer_score?: number
  } | undefined

  const evidence = currentEvidence

  const trackAction = async (action: "shortlist" | "contact" | "reject") => {
    setActionLoading(action)
    try {
      await jobsApi.trackAction(jobId, candidate.id, { action })
      toast.success(`Candidate ${action === "shortlist" ? "shortlisted" : action === "contact" ? "contacted" : "rejected"}`)
      onAction()
    } catch {
      toast.error("Failed to update")
    } finally {
      setActionLoading(null)
    }
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      const result = await jobsApi.regenerateEvidence(jobId, candidate.id)
      toast.success(`Evidence regenerated using ${result.feedback_used} feedback examples`)
      if (result.evidence) {
        setCurrentEvidence(result.evidence as unknown as EvidenceCard)
      }
    } catch {
      toast.error("Failed to regenerate")
    } finally {
      setIsRegenerating(false)
    }
  }

  const getAvatarUrl = () => {
    if (candidate.github_username) return `https://unavatar.io/github/${candidate.github_username}`
    if (candidate.x_username) return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
    return ""
  }

  // Simple score color: green >= 70, yellow >= 50, red < 50
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-500"
    if (score >= 50) return "text-yellow-500"
    return "text-red-500"
  }

  const isShortlisted = jc.status === CandidateStatus.SHORTLISTED
  const isRejected = jc.status === CandidateStatus.REJECTED

  return (
    <div className={cn(
      "border rounded-lg transition-all",
      isShortlisted && "border-green-500/50 bg-green-500/5",
      isRejected && "border-red-500/30 bg-red-500/5 opacity-60",
      !isShortlisted && !isRejected && "border-border bg-card hover:border-primary/50"
    )}>
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Avatar className="h-10 w-10">
            <AvatarImage src={getAvatarUrl()} />
            <AvatarFallback className="bg-muted text-sm text-foreground">
              {(candidate.display_name || candidate.github_username || candidate.x_username || "?").substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground truncate">
                {candidate.display_name || candidate.github_username || candidate.x_username}
              </span>
              {isShortlisted && (
                <span className="text-xs text-green-500 font-medium">✓ Shortlisted</span>
              )}
              {isRejected && (
                <span className="text-xs text-red-500 font-medium">✗ Rejected</span>
              )}
            </div>
            {candidate.github_username ? (
              <a
                href={`https://github.com/${candidate.github_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
              >
                @{candidate.github_username}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : candidate.x_username ? (
              <a
                href={`https://x.com/${candidate.x_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
              >
                @{candidate.x_username}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>

          {/* Score */}
          {jc.match_score !== null && jc.match_score !== undefined && (
            <div className="text-right">
              <div className={cn("text-2xl font-bold", getScoreColor(jc.match_score))}>
                {Math.round(jc.match_score)}
              </div>
            </div>
          )}
        </div>

        {/* Stats - simplified */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {githubProfile?.developer_score && (
            <span>Dev: {githubProfile.developer_score}</span>
          )}
          {githubProfile?.public_repos && (
            <span>{githubProfile.public_repos} repos</span>
          )}
          {candidate.followers_count > 0 && (
            <span>{candidate.followers_count.toLocaleString()} followers</span>
          )}
          {evidence && (
            <span className={cn(
              "font-medium",
              evidence.match_strength === "strong" && "text-green-500",
              evidence.match_strength === "moderate" && "text-yellow-500",
              evidence.match_strength === "weak" && "text-red-500"
            )}>
              {evidence.match_strength.toUpperCase()}
            </span>
          )}
        </div>

        {/* Skills - max 4 */}
        {candidate.skills_extracted && candidate.skills_extracted.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {candidate.skills_extracted.slice(0, 4).map((skill) => (
              <span key={skill} className="text-[10px] px-2 py-0.5 bg-secondary text-secondary-foreground rounded">
                {skill}
              </span>
            ))}
            {candidate.skills_extracted.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{candidate.skills_extracted.length - 4}</span>
            )}
          </div>
        )}

        {/* Actions - always visible, simple */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          <Button
            size="sm"
            variant={isShortlisted ? "default" : "outline"}
            className={cn(
              "h-8 text-xs flex-1",
              isShortlisted ? "bg-green-600 hover:bg-green-700 text-white" : "hover:bg-green-500/10 hover:text-green-500 hover:border-green-500"
            )}
            onClick={() => trackAction("shortlist")}
            disabled={actionLoading !== null || isShortlisted}
          >
            <Check className="h-3 w-3 mr-1" />
            {isShortlisted ? "Shortlisted" : "Shortlist"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs flex-1 hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500"
            onClick={() => trackAction("contact")}
            disabled={actionLoading !== null}
          >
            <Mail className="h-3 w-3 mr-1" />
            Contact
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-8 text-xs",
              isRejected ? "bg-red-600/20 text-red-500 border-red-500" : "hover:bg-red-500/10 hover:text-red-500 hover:border-red-500"
            )}
            onClick={() => trackAction("reject")}
            disabled={actionLoading !== null || isRejected}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Evidence - collapsible */}
      {evidence && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <span>View Evidence</span>
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 border-t border-border space-y-3 text-sm">
              {evidence.why_matched && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Why</div>
                  <p className="text-foreground text-xs leading-relaxed">{evidence.why_matched}</p>
                </div>
              )}

              {/* Green Flags with feedback */}
              {evidence.green_flags && evidence.green_flags.length > 0 && (
                <div>
                  <div className="text-[10px] text-green-500 uppercase mb-1">✓ Green Flags</div>
                  <ul className="space-y-1">
                    {evidence.green_flags.map((flag: string, i: number) => (
                      <EvidenceItemWithFeedback
                        key={i}
                        content={flag}
                        itemType="green_flags"
                        itemIndex={i}
                        jobId={jobId}
                        candidateId={candidate.id}
                        variant="green"
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Red Flags with feedback */}
              {evidence.red_flags && evidence.red_flags.length > 0 && (
                <div>
                  <div className="text-[10px] text-red-500 uppercase mb-1">✗ Red Flags</div>
                  <ul className="space-y-1">
                    {evidence.red_flags.map((flag: string, i: number) => (
                      <EvidenceItemWithFeedback
                        key={i}
                        content={flag}
                        itemType="red_flags"
                        itemIndex={i}
                        jobId={jobId}
                        candidateId={candidate.id}
                        variant="red"
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Signals with feedback */}
              {evidence.signals && evidence.signals.length > 0 && (
                <div>
                  <div className="text-[10px] text-amber-500 uppercase mb-1">⚡ Signals</div>
                  <ul className="space-y-1">
                    {evidence.signals.map((signal: string, i: number) => (
                      <EvidenceItemWithFeedback
                        key={i}
                        content={signal}
                        itemType="signals"
                        itemIndex={i}
                        jobId={jobId}
                        candidateId={candidate.id}
                        variant="neutral"
                      />
                    ))}
                  </ul>
                </div>
              )}

              {evidence.outreach_hook && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase mb-1">Outreach</div>
                  <p className="text-muted-foreground text-xs italic">&ldquo;{evidence.outreach_hook}&rdquo;</p>
                </div>
              )}
              
              {/* Regenerate button */}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Rate items above • then regenerate</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Regenerate
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string

  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<JobCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  
  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState(0)
  
  // Sourcing state
  const [sourcingOpen, setSourcingOpen] = useState(false)
  const [sourcingQuery, setSourcingQuery] = useState("")
  const [sourcingLoading, setSourcingLoading] = useState(false)
  
  // Filter state
  const [stageFilter, setStageFilter] = useState<PipelineStage>("all")

  const fetchJob = useCallback(async () => {
    try {
      const data = await jobsApi.get(jobId)
      setJob(data)
    } catch {
      toast.error("Failed to load job")
    }
  }, [jobId])

  const fetchCandidates = useCallback(async () => {
    try {
      setLoadingCandidates(true)
      const data = await jobsApi.getCandidates(jobId, 100)
      setCandidates(data)
    } catch {
      toast.error("Failed to load candidates")
    } finally {
      setLoadingCandidates(false)
    }
  }, [jobId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchJob()
      await fetchCandidates()
      setLoading(false)
    }
    init()
  }, [fetchJob, fetchCandidates])

  useEffect(() => {
    if (job && !sourcingQuery) {
      setSourcingQuery(job.title.toLowerCase())
    }
  }, [job, sourcingQuery])

  const pollTask = async (taskId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const status = await fetch(`http://localhost:8000/tasks/${taskId}`).then((r) => r.json())
          if (status.status === "SUCCESS") {
            clearInterval(interval)
            resolve(true)
          } else if (status.status === "FAILURE") {
            clearInterval(interval)
            resolve(false)
          }
        } catch {
          clearInterval(interval)
          resolve(false)
        }
      }, 2000)
    })
  }

  const runFullPipeline = async () => {
    if (candidates.length === 0) {
      toast.error("No candidates to process")
      return
    }

    setPipelineRunning(true)
    setPipelineProgress(0)

    try {
      setPipelineStep("Enriching...")
      setPipelineProgress(10)
      const enrichResult = await jobsApi.enrich(jobId)
      await pollTask(enrichResult.task_id)
      setPipelineProgress(33)

      setPipelineStep("Scoring...")
      const scoreResult = await jobsApi.calculateScores(jobId)
      await pollTask(scoreResult.task_id)
      setPipelineProgress(66)

      setPipelineStep("Generating evidence...")
      const evidenceResult = await jobsApi.generateEvidence(jobId)
      await pollTask(evidenceResult.task_id)
      setPipelineProgress(100)

      toast.success("Pipeline complete!")
      await fetchCandidates()
    } catch {
      toast.error("Pipeline failed")
    } finally {
      setPipelineRunning(false)
      setPipelineStep(null)
      setPipelineProgress(0)
    }
  }

  const handleSourceGitHub = async () => {
    if (!sourcingQuery.trim()) {
      toast.error("Enter a search query")
      return
    }

    setSourcingLoading(true)
    try {
      const request: GitHubSourceRequest = {
        search_query: sourcingQuery,
        max_results: 15,
        min_followers: 10,
        min_repos: 5,
        min_dev_score: 50,
      }
      const result = await jobsApi.sourceGitHub(jobId, request)
      toast.success("Sourcing started...")
      
      const success = await pollTask(result.task_id)
      if (success) {
        toast.success("Sourcing complete!")
        await fetchCandidates()
        setSourcingOpen(false)
      }
    } catch {
      toast.error("Sourcing failed")
    } finally {
      setSourcingLoading(false)
    }
  }

  // Filter candidates
  const filteredCandidates = candidates
    .filter((jc) => {
      if (stageFilter === "all") return true
      return jc.status === stageFilter
    })
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))

  const stats = {
    total: candidates.length,
    shortlisted: candidates.filter((c) => c.status === CandidateStatus.SHORTLISTED).length,
    rejected: candidates.filter((c) => c.status === CandidateStatus.REJECTED).length,
  }

  if (loading) {
    return (
      <div className="flex-1 p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex-1 p-8">
        <p className="text-zinc-500">Job not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/jobs")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{job.title}</h1>
              <p className="text-sm text-muted-foreground">{stats.total} candidates · {stats.shortlisted} shortlisted</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sheet open={sourcingOpen} onOpenChange={setSourcingOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Search className="h-4 w-4 mr-2" />
                  Source
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Source from GitHub</SheetTitle>
                  <SheetDescription>Find developers matching your requirements</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Input
                    value={sourcingQuery}
                    onChange={(e) => setSourcingQuery(e.target.value)}
                    placeholder="e.g. machine learning engineer"
                  />
                  <Button onClick={handleSourceGitHub} disabled={sourcingLoading} className="w-full">
                    {sourcingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Github className="h-4 w-4 mr-2" />}
                    {sourcingLoading ? "Searching..." : "Find Developers"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <Button
              onClick={runFullPipeline}
              disabled={pipelineRunning || candidates.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {pipelineRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {pipelineStep}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run AI Pipeline
                </>
              )}
            </Button>
          </div>
        </div>

        {pipelineRunning && (
          <Progress value={pipelineProgress} className="h-1 mt-4" />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border p-4 overflow-y-auto">
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-3">Requirements</h3>
          {job.requirements ? (
            <p className="text-xs text-foreground whitespace-pre-wrap">{job.requirements}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No requirements</p>
          )}
          
          {job.keywords && job.keywords.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-1">
                {job.keywords.map((kw) => (
                  <span key={kw} className="text-[10px] px-2 py-0.5 bg-secondary text-secondary-foreground rounded">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          {/* Pipeline status */}
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-3">Pipeline</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className={cn("h-4 w-4", stats.total > 0 ? "text-green-500" : "text-muted-foreground")} />
              <span className={stats.total > 0 ? "text-foreground" : "text-muted-foreground"}>Sourced ({stats.total})</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className={cn("h-4 w-4", stats.shortlisted > 0 ? "text-green-500" : "text-muted-foreground")} />
              <span className={stats.shortlisted > 0 ? "text-foreground" : "text-muted-foreground"}>Shortlisted ({stats.shortlisted})</span>
            </div>
          </div>
        </div>

        {/* Candidates */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="px-6 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={stageFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStageFilter("all")}
                className="text-xs"
              >
                All ({candidates.length})
              </Button>
              <Button
                variant={stageFilter === "shortlisted" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStageFilter("shortlisted")}
                className="text-xs"
              >
                Shortlisted ({stats.shortlisted})
              </Button>
              <Button
                variant={stageFilter === "rejected" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStageFilter("rejected")}
                className="text-xs"
              >
                Rejected ({stats.rejected})
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchCandidates} disabled={loadingCandidates}>
              <RefreshCw className={cn("h-4 w-4", loadingCandidates && "animate-spin")} />
            </Button>
          </div>

          {/* Candidates grid */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {filteredCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {candidates.length === 0 ? "No candidates yet" : "No candidates match filter"}
                  </p>
                  {candidates.length === 0 && (
                    <Button onClick={() => setSourcingOpen(true)} variant="outline">
                      <Github className="h-4 w-4 mr-2" />
                      Source Candidates
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCandidates.map((jc) => (
                    <CandidateCard
                      key={jc.id}
                      jc={jc}
                      jobId={jobId}
                      onAction={fetchCandidates}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
