"use client"

import { CreateJobDialog } from "@/components/create-job-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { jobsApi, Job, JobStatus, JobCandidate } from "@/lib/api"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Brain,
  FileText,
  Target,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface JobWithStats extends Job {
  candidateCount?: number
  scoredCount?: number
  evidenceCount?: number
  avgScore?: number
}

function JobCard({ job, onDelete }: { job: JobWithStats; onDelete: () => void }) {
  const router = useRouter()
  const [stats, setStats] = useState<{
    total: number
    scored: number
    evidence: number
    avgScore: number
  } | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const candidates = await jobsApi.getCandidates(job.id, 100)
        const scored = candidates.filter((c) => c.match_score !== null)
        const withEvidence = candidates.filter((c) => c.evidence)
        const avgScore = scored.length > 0
          ? Math.round(scored.reduce((sum, c) => sum + (c.match_score || 0), 0) / scored.length)
          : 0
        setStats({
          total: candidates.length,
          scored: scored.length,
          evidence: withEvidence.length,
          avgScore,
        })
      } catch {
        setStats({ total: 0, scored: 0, evidence: 0, avgScore: 0 })
      } finally {
        setLoadingStats(false)
      }
    }
    fetchStats()
  }, [job.id])

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case JobStatus.ACTIVE:
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      case JobStatus.PAUSED:
        return "bg-amber-500/20 text-amber-400 border-amber-500/30"
      case JobStatus.CLOSED:
        return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
      default:
        return ""
    }
  }

  return (
    <div
      className="group relative bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer"
      onClick={() => router.push(`/jobs/${job.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg truncate">{job.title}</h3>
            <Badge variant="outline" className={cn("text-xs", getStatusColor(job.status))}>
              {job.status}
            </Badge>
          </div>
          {job.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation()
              navigator.clipboard.writeText(job.id)
              toast.success("Job ID copied")
            }}>
              Copy Job ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-400"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center p-2 bg-muted/50 rounded-lg">
          {loadingStats ? (
            <Skeleton className="h-6 w-8 mx-auto mb-1" />
          ) : (
            <div className="text-lg font-bold text-foreground">{stats?.total || 0}</div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            <Users className="h-3 w-3" />
            Candidates
          </div>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded-lg">
          {loadingStats ? (
            <Skeleton className="h-6 w-8 mx-auto mb-1" />
          ) : (
            <div className="text-lg font-bold text-cyan-400">{stats?.scored || 0}</div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            <Brain className="h-3 w-3" />
            Scored
          </div>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded-lg">
          {loadingStats ? (
            <Skeleton className="h-6 w-8 mx-auto mb-1" />
          ) : (
            <div className="text-lg font-bold text-violet-400">{stats?.evidence || 0}</div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            <FileText className="h-3 w-3" />
            Evidence
          </div>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded-lg">
          {loadingStats ? (
            <Skeleton className="h-6 w-8 mx-auto mb-1" />
          ) : (
            <div className="text-lg font-bold text-amber-400">{stats?.avgScore || "-"}</div>
          )}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            <Target className="h-3 w-3" />
            Avg Score
          </div>
        </div>
      </div>

      {/* Keywords */}
      {job.keywords && job.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {job.keywords.slice(0, 5).map((kw) => (
            <Badge key={kw} variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground">
              {kw}
            </Badge>
          ))}
          {job.keywords.length > 5 && (
            <Badge variant="outline" className="text-[10px]">
              +{job.keywords.length - 5}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
          View Pipeline
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await jobsApi.list()
      setJobs(data)
    } catch {
      toast.error("Failed to fetch jobs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const handleDelete = async (jobId: string) => {
    try {
      await jobsApi.delete(jobId)
      toast.success("Job deleted")
      fetchJobs()
    } catch {
      toast.error("Failed to delete job")
    }
  }

  return (
    <div className="flex-1 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">
            Manage your open positions and track sourcing progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <CreateJobDialog onCreated={fetchJobs} />
        </div>
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No jobs yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Create your first job to start sourcing candidates
          </p>
          <CreateJobDialog onCreated={fetchJobs} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onDelete={() => handleDelete(job.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
