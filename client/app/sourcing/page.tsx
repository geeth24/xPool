"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { jobsApi, tasksApi, Job, GitHubSourceRequest, SearchStrategy } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, Loader2, XCircle, Github, Search, Globe, Code2, SlidersHorizontal, ArrowRight, Sparkles } from "lucide-react"

const sourcingFormSchema = z.object({
  jobId: z.string().min(1, "Please select a job."),
  searchQuery: z.string().min(2, "Search query must be at least 2 characters"),
  language: z.string().optional(),
  location: z.string().optional(),
  minFollowers: z.number().min(0).default(10),
  minRepos: z.number().min(0).default(5),
  maxResults: z.number().min(1).max(50).default(15),
  requireXProfile: z.boolean().default(false),
  minDevScore: z.number().min(0).max(100).default(60),
})

type SourcingFormValues = z.infer<typeof sourcingFormSchema>

const POPULAR_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "swift",
  "kotlin",
  "java",
  "go",
  "rust",
  "c++",
  "ruby",
]

export default function SourcingPage() {
  const searchParams = useSearchParams()
  const preselectedJobId = searchParams.get("jobId")
  
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = React.useState(true)
  const [taskId, setTaskId] = React.useState<string | null>(null)
  const [taskStatus, setTaskStatus] = React.useState<string | null>(null)
  const [taskResult, setTaskResult] = React.useState<Record<string, unknown> | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [aiStrategy, setAiStrategy] = React.useState<SearchStrategy | null>(null)
  const [loadingStrategy, setLoadingStrategy] = React.useState(false)

  const form = useForm<SourcingFormValues>({
    resolver: zodResolver(sourcingFormSchema),
    defaultValues: {
      jobId: preselectedJobId || "",
      searchQuery: "",
      language: "",
      location: "",
      minFollowers: 10,
      minRepos: 5,
      maxResults: 15,
      requireXProfile: false,
      minDevScore: 60,
    },
  })

  React.useEffect(() => {
    async function fetchJobs() {
      try {
        const data = await jobsApi.list()
        setJobs(data)
      } catch {
        toast.error("Failed to load jobs")
      } finally {
        setLoadingJobs(false)
      }
    }
    fetchJobs()
  }, [])

  React.useEffect(() => {
    if (preselectedJobId) {
      form.setValue("jobId", preselectedJobId)
    }
  }, [preselectedJobId, form])

  const selectedJobId = form.watch("jobId")
  
  const loadAiStrategy = React.useCallback(async (jobId: string) => {
    setLoadingStrategy(true)
    try {
      const result = await jobsApi.getSearchStrategy(jobId)
      if (result.search_strategy) {
        setAiStrategy(result.search_strategy)
        // auto-fill form from strategy
        if (result.search_strategy.bio_keywords?.length > 0 && !form.getValues("searchQuery")) {
          form.setValue("searchQuery", result.search_strategy.bio_keywords.slice(0, 3).join(" "))
        }
        if (result.search_strategy.languages?.length > 0 && !form.getValues("language")) {
          form.setValue("language", result.search_strategy.languages[0])
        }
        if (result.search_strategy.location_suggestions?.length > 0 && !form.getValues("location")) {
          form.setValue("location", result.search_strategy.location_suggestions[0])
        }
      } else {
        setAiStrategy(null)
      }
    } catch {
      setAiStrategy(null)
    } finally {
      setLoadingStrategy(false)
    }
  }, [form])

  React.useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      if (job && !form.getValues("searchQuery")) {
        form.setValue("searchQuery", job.title.toLowerCase())
      }
      loadAiStrategy(selectedJobId)
    }
  }, [selectedJobId, jobs, form, loadAiStrategy])

  React.useEffect(() => {
    if (!taskId) return

    const interval = setInterval(async () => {
      try {
        const status = await tasksApi.getStatus(taskId)
        setTaskStatus(status.status)
        if (status.result && status.status === "SUCCESS") {
          setTaskResult(status.result as Record<string, unknown>)
        }
        if (status.status === "SUCCESS" || status.status === "FAILURE") {
          clearInterval(interval)
        }
      } catch (error) {
        console.error("Failed to poll task status:", error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [taskId])

  async function onSubmit(data: SourcingFormValues) {
    try {
      setSubmitting(true)
      setTaskId(null)
      setTaskStatus(null)
      setTaskResult(null)

      const request: GitHubSourceRequest = {
        search_query: data.searchQuery,
        max_results: data.maxResults,
        min_followers: data.minFollowers,
        min_repos: data.minRepos,
        require_x_profile: data.requireXProfile,
        min_dev_score: data.minDevScore,
      }

      if (data.language) {
        request.language = data.language
      }

      if (data.location) {
        request.location = data.location
      }

      const result = await jobsApi.sourceGitHub(data.jobId, request)
      setTaskId(result.task_id)
      setTaskStatus("PENDING")
      toast.success("GitHub sourcing started", {
        description: "Searching GitHub for developers...",
      })
    } catch (error) {
      toast.error("Failed to start sourcing", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusIcon = () => {
    switch (taskStatus) {
      case "PENDING":
      case "STARTED":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />
      case "SUCCESS":
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case "FAILURE":
        return <XCircle className="h-5 w-5 text-rose-500" />
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />
    }
  }

  return (
    <div className="flex-1 space-y-8 p-8 pt-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
               <Github className="h-6 w-6" />
            </div>
            Developer Sourcing
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Find verified developers on GitHub, automatically enriched with X/Twitter data and AI analysis.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                Search Configuration
              </CardTitle>
              <CardDescription>
                Define your ideal candidate profile criteria.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingJobs ? (
                <div className="space-y-6">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <div className="grid grid-cols-2 gap-4">
                     <Skeleton className="h-12 w-full" />
                     <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="jobId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Job Pipeline</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Select a job position" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {jobs.map((job) => (
                                <SelectItem key={job.id} value={job.id}>
                                  <div className="flex items-center gap-2">
                                    {job.title}
                                    {job.search_strategy && (
                                      <Sparkles className="h-3 w-3 text-primary" />
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Candidates will be added to this job.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* AI Strategy Section */}
                    {selectedJobId && aiStrategy && (
                      <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-sm text-emerald-700 dark:text-emerald-400">AI Search Strategy</span>
                          {loadingStrategy && <Loader2 className="h-3 w-3 animate-spin" />}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {aiStrategy.bio_keywords?.slice(0, 6).map(kw => (
                              <Badge 
                                key={kw} 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-emerald-500/20"
                                onClick={() => {
                                  const current = form.getValues("searchQuery")
                                  if (!current.includes(kw)) {
                                    form.setValue("searchQuery", current ? `${current} ${kw}` : kw)
                                  }
                                }}
                              >
                                {kw}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Click tags to add to search • {aiStrategy.role_type !== "unknown" && `Role: ${aiStrategy.role_type.replace(/_/g, " ")}`}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="searchQuery"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Keywords</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="e.g. machine learning engineer, iOS developer" {...field} className="pl-9 h-11" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="language"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary Language</FormLabel>
                              <Select onValueChange={(value) => field.onChange(value === "any" ? "" : value)} value={field.value || "any"}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Any language" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="any">Any language</SelectItem>
                                  {POPULAR_LANGUAGES.map((lang) => (
                                    <SelectItem key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <div className="relative">
                                   <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                   <Input placeholder="e.g. San Francisco" {...field} className="pl-9 h-11" />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t">
                      <FormField
                        control={form.control}
                        name="maxResults"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Candidates</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="minFollowers"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Followers</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="minRepos"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Repos</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="requireXProfile"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-xl border p-4 bg-muted/20">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base font-medium">Require X/Twitter Profile</FormLabel>
                            <FormDescription>Only include developers who have a linked X profile for AI analysis.</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={submitting} className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90">
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Sourcing Candidates...
                        </>
                      ) : (
                        <>
                          Start Sourcing
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          {taskId && (
            <Card className="border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-bottom-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  {getStatusIcon()}
                  Sourcing Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Task ID:</span>
                    <code className="bg-background px-2 py-1 rounded border font-mono text-xs">{taskId}</code>
                  </div>
                  
                  {taskResult ? (
                    <div className="grid grid-cols-3 gap-4 pt-2">
                      <div className="bg-background border rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-emerald-600">
                          {(taskResult as { candidates_added?: number }).candidates_added || 0}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Added</div>
                      </div>
                      <div className="bg-background border rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-amber-500">
                          {(taskResult as { candidates_skipped?: number }).candidates_skipped || 0}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Skipped</div>
                      </div>
                      <div className="bg-background border rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-blue-500">
                          {(taskResult as { candidates_with_x?: number }).candidates_with_x || 0}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Has X</div>
                      </div>
                    </div>
                  ) : (
                     <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 p-3 rounded-md border border-dashed">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Waiting for results...
                     </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="bg-muted/30 border-none shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Sourcing Process</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative pl-6 border-l-2 border-muted">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-background border-2 border-primary" />
                <h4 className="text-sm font-semibold">GitHub Search</h4>
                <p className="text-xs text-muted-foreground mt-1">Finds developers matching language, location, and keywords.</p>
              </div>
              <div className="relative pl-6 border-l-2 border-muted">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-background border-2 border-muted-foreground" />
                <h4 className="text-sm font-semibold">Profile Analysis</h4>
                <p className="text-xs text-muted-foreground mt-1">Evaluates repo quality, contribution history, and influence.</p>
              </div>
              <div className="relative pl-6 border-l-2 border-muted">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-background border-2 border-muted-foreground" />
                <h4 className="text-sm font-semibold">X Enrichment</h4>
                <p className="text-xs text-muted-foreground mt-1">Cross-references data with X/Twitter for personality insights.</p>
              </div>
              <div className="relative pl-6 border-l-2 border-muted">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-background border-2 border-muted-foreground" />
                <h4 className="text-sm font-semibold">Pipeline Entry</h4>
                <p className="text-xs text-muted-foreground mt-1">Qualified candidates are scored and added to your job list.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/50 dark:border-amber-800/30">
             <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                   <Code2 className="h-4 w-4" />
                   Pro Tips
                </CardTitle>
             </CardHeader>
             <CardContent className="text-xs space-y-2 text-amber-700/80 dark:text-amber-300/80">
                <p>• Use specific tech stacks in keywords (e.g. &quot;Next.js&quot; instead of just &quot;React&quot;).</p>
                <p>• Set higher &quot;Min Repos&quot; (10+) for senior roles.</p>
                <p>• Location filter is strict; try broader regions if results are low.</p>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
