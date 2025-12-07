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
import { motion, AnimatePresence } from "motion/react"
import {
  Users,
  Brain,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Calendar,
  Search,
  Briefcase,
  TrendingUp,
  ChevronRight,
  Target
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"

interface JobStats {
  total: number
  scored: number
  avgScore: number
}

function JobRow({ job, onDelete }: { job: Job; onDelete: () => void }) {
  const router = useRouter()
  const [stats, setStats] = useState<JobStats | null>(null)
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
        return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
      case JobStatus.PAUSED:
        return "text-amber-600 bg-amber-500/10 border-amber-500/20"
      case JobStatus.CLOSED:
        return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20"
      default:
        return "bg-secondary text-secondary-foreground"
    }
  }

  const scoredPercentage = stats && stats.total > 0 
    ? Math.round((stats.scored / stats.total) * 100) 
    : 0

  return (
    <TableRow 
      className="group cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => router.push(`/jobs/${job.id}`)}
    >
      <TableCell className="py-4 pl-4">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {job.title}
          </span>
          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">
            {job.description || "No description"}
          </span>
        </div>
      </TableCell>
      
      <TableCell>
        <Badge variant="outline" className={cn("font-medium text-xs", getStatusColor(job.status))}>
          {job.status}
        </Badge>
      </TableCell>
      
      <TableCell>
        {loadingStats ? (
          <Skeleton className="h-5 w-12" />
        ) : (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{stats?.total || 0}</span>
          </div>
        )}
      </TableCell>
      
      <TableCell>
        {loadingStats ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <div className="flex items-center gap-3 min-w-[120px]">
            <Progress value={scoredPercentage} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground w-12">
              {stats?.scored || 0}/{stats?.total || 0}
            </span>
          </div>
        )}
      </TableCell>
      
      <TableCell>
        {loadingStats ? (
          <Skeleton className="h-5 w-12" />
        ) : stats?.avgScore && stats.avgScore > 0 ? (
          <div className="flex items-center gap-1.5">
            <Target className={cn(
              "h-4 w-4",
              stats.avgScore >= 70 ? "text-emerald-500" :
              stats.avgScore >= 50 ? "text-amber-500" : "text-zinc-400"
            )} />
            <span className={cn(
              "font-medium",
              stats.avgScore >= 70 ? "text-emerald-600" :
              stats.avgScore >= 50 ? "text-amber-600" : "text-muted-foreground"
            )}>
              {stats.avgScore}%
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      
      <TableCell>
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {job.keywords?.slice(0, 2).map(kw => (
            <span key={kw} className="text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded text-secondary-foreground">
              {kw}
            </span>
          ))}
          {(job.keywords?.length || 0) > 2 && (
            <span className="text-[10px] text-muted-foreground">+{(job.keywords?.length || 0) - 2}</span>
          )}
        </div>
      </TableCell>
      
      <TableCell className="text-muted-foreground text-sm">
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
        </div>
      </TableCell>
      
      <TableCell>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
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
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [allStats, setAllStats] = useState<{ totalCandidates: number; avgScore: number }>({ totalCandidates: 0, avgScore: 0 })

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await jobsApi.list()
      setJobs(data)
      
      // fetch aggregate stats
      let totalCandidates = 0
      let totalScore = 0
      let scoredJobs = 0
      
      await Promise.all(data.map(async (job) => {
        try {
          const stats = await jobsApi.getStats(job.id)
          totalCandidates += stats.total_candidates
          if (stats.avg_score) {
            totalScore += stats.avg_score
            scoredJobs++
          }
        } catch {}
      }))
      
      setAllStats({
        totalCandidates,
        avgScore: scoredJobs > 0 ? Math.round(totalScore / scoredJobs) : 0
      })
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
  
  const activeJobs = jobs.filter(j => j.status === JobStatus.ACTIVE).length

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 gradient-bg min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
            Jobs
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
            >
              <Briefcase className="h-8 w-8 text-primary" />
            </motion.span>
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage your open positions and track sourcing progress.
          </p>
        </div>
        <CreateJobDialog onCreated={fetchJobs} />
      </motion.div>

      {/* summary cards */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid gap-4 grid-cols-2 lg:grid-cols-4"
      >
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Total Jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Active
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeJobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Total Candidates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allStats.totalCandidates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Avg Match Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allStats.avgScore > 0 ? `${allStats.avgScore}%` : "—"}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* search and table */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg">All Jobs</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search jobs..." 
                    className="pl-9 h-9 bg-background" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" onClick={fetchJobs} disabled={loading} className="h-9 w-9">
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6 space-y-3"
                >
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </motion.div>
              ) : filteredJobs.length === 0 ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <motion.div 
                    className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-4"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Briefcase className="h-7 w-7 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-semibold mb-1">No jobs found</h3>
                  <p className="text-muted-foreground mb-5 text-sm max-w-sm">
                    {search ? "Try adjusting your search terms." : "Create your first job posting to start sourcing candidates."}
                  </p>
                  {!search && <CreateJobDialog onCreated={fetchJobs} />}
                </motion.div>
              ) : (
                <motion.div 
                  key="jobs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[280px] pl-4">Job</TableHead>
                        <TableHead className="w-[90px]">Status</TableHead>
                        <TableHead className="w-[100px]">Candidates</TableHead>
                        <TableHead className="w-[150px]">Scored</TableHead>
                        <TableHead className="w-[90px]">Avg Score</TableHead>
                        <TableHead className="w-[160px]">Keywords</TableHead>
                        <TableHead className="w-[130px]">Created</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((job) => (
                        <JobRow key={job.id} job={job} onDelete={() => handleDelete(job.id)} />
                      ))}
                    </TableBody>
                  </Table>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
