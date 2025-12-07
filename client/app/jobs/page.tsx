"use client"

import { CreateJobDialog } from "@/components/create-job-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { jobsApi, Job, JobStatus } from "@/lib/api"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  Brain,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Calendar,
  Search
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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
    avgScore: number
  } | null>(null)
  
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const statsData = await jobsApi.getStats(job.id)
        setStats({
          total: statsData.total_candidates,
          scored: statsData.scored_candidates,
          avgScore: statsData.avg_score ? Math.round(statsData.avg_score) : 0,
        })
      } catch (error) {
        console.error("Failed to fetch job stats:", error)
        setStats({ total: 0, scored: 0, avgScore: 0 })
      } finally {
        setLoadingStats(false)
      }
    }
    fetchStats()
  }, [job.id])

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case JobStatus.ACTIVE:
        return "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
      case JobStatus.PAUSED:
        return "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
      case JobStatus.CLOSED:
        return "text-zinc-600 bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
      default:
        return "bg-secondary text-secondary-foreground"
    }
  }

  return (
    <Card 
      className="group hover:border-primary/50 transition-all cursor-pointer shadow-sm"
      onClick={() => router.push(`/jobs/${job.id}`)}
    >
      <CardHeader className="pb-3 space-y-0">
        <div className="flex items-start justify-between">
           <div className="space-y-1 pr-4">
             <CardTitle className="text-base font-semibold leading-tight">{job.title}</CardTitle>
             <p className="text-sm text-muted-foreground line-clamp-1">{job.description || "No description"}</p>
           </div>
           <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(job.id)
                  toast.success("Job ID copied")
                }}>
                  Copy ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
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
      </CardHeader>
      
      <CardContent className="pb-3">
         <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5" title="Total Candidates">
               <Users className="h-4 w-4" />
               {loadingStats ? <Skeleton className="h-4 w-8" /> : <span>{stats?.total || 0}</span>}
            </div>
            <div className="flex items-center gap-1.5" title="Scored Candidates">
               <Brain className="h-4 w-4" />
               {loadingStats ? <Skeleton className="h-4 w-8" /> : <span>{stats?.scored || 0}</span>}
            </div>
         </div>
         
         <div className="mt-3 flex flex-wrap gap-1.5 h-6 overflow-hidden">
            {job.keywords?.slice(0, 3).map(kw => (
               <span key={kw} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground border border-transparent">
                  {kw}
               </span>
            ))}
            {(job.keywords?.length || 0) > 3 && (
               <span className="text-[10px] text-muted-foreground px-1.5 py-0.5">+{(job.keywords?.length || 0) - 3}</span>
            )}
         </div>
      </CardContent>

      <CardFooter className="pt-0 flex items-center justify-between">
         <Badge variant="outline" className={cn("font-normal text-xs", getStatusColor(job.status))}>
            {job.status.toLowerCase()}
         </Badge>
         <div className="flex items-center text-xs text-muted-foreground">
            <Calendar className="mr-1 h-3 w-3" />
            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
         </div>
      </CardFooter>
    </Card>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

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

  const filteredJobs = jobs.filter(job => 
    job.title.toLowerCase().includes(search.toLowerCase()) || 
    job.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">
            Manage your open positions.
          </p>
        </div>
        <CreateJobDialog onCreated={fetchJobs} />
      </div>

      <div className="flex items-center gap-2">
         <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search jobs..." 
              className="pl-9 bg-background" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
         </div>
         <Button variant="outline" size="icon" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
         </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-dashed">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
             <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">No jobs found</h3>
          <p className="text-sm text-muted-foreground mb-4">
             {search ? "Try adjusting your search terms." : "Create a job to get started."}
          </p>
          {!search && <CreateJobDialog onCreated={fetchJobs} />}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onDelete={() => handleDelete(job.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
