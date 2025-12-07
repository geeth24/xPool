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
import { jobsApi, tasksApi, Job, GitHubSourceRequest } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, Loader2, XCircle, Github, Search } from "lucide-react"

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

  // auto-fill search query from job title
  const selectedJobId = form.watch("jobId")
  React.useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      if (job && !form.getValues("searchQuery")) {
        form.setValue("searchQuery", job.title.toLowerCase())
      }
    }
  }, [selectedJobId, jobs, form])

  // poll task status
  React.useEffect(() => {
    if (!taskId) return

    const interval = setInterval(async () => {
      try {
        const status = await tasksApi.getStatus(taskId)
        setTaskStatus(status.status)
        if (status.result) {
          setTaskResult(status.result)
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
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "SUCCESS":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "FAILURE":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Github className="h-8 w-8" />
            Developer Sourcing
          </h2>
          <p className="text-muted-foreground">
            Find verified developers on GitHub, enriched with X/Twitter data.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Configuration
              </CardTitle>
              <CardDescription>
                Search GitHub for developers matching your criteria.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="jobId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Job</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a job position" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {jobs.map((job) => (
                                <SelectItem key={job.id} value={job.id}>
                                  {job.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Candidates will be added to this job pipeline.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="searchQuery"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Search Query</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. machine learning engineer, iOS developer, fullstack"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Keywords to search for in GitHub user profiles.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary Language</FormLabel>
                            <Select
                              onValueChange={(value) => field.onChange(value === "any" ? "" : value)}
                              value={field.value || "any"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Any language" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="any">Any language</SelectItem>
                                {POPULAR_LANGUAGES.map((lang) => (
                                  <SelectItem key={lang} value={lang}>
                                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                                  </SelectItem>
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
                            <FormLabel>Location (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. San Francisco, London"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="maxResults"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Results</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
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
                              <Input type="number" {...field} />
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
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="minDevScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Developer Score ({field.value})</FormLabel>
                          <FormControl>
                            <Input
                              type="range"
                              min="0"
                              max="100"
                              {...field}
                              className="cursor-pointer"
                            />
                          </FormControl>
                          <FormDescription>
                            Score based on repos, stars, and activity. Higher = more active developers.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="requireXProfile"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Require X/Twitter Profile
                            </FormLabel>
                            <FormDescription>
                              Only include developers who have an X profile linked.
                              Useful for outreach.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Github className="mr-2 h-4 w-4" />
                          Start GitHub Sourcing
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          {taskId && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getStatusIcon()}
                  Task Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Task ID:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {taskId}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      variant={
                        taskStatus === "SUCCESS"
                          ? "default"
                          : taskStatus === "FAILURE"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {taskStatus}
                    </Badge>
                  </div>
                  {taskResult && (
                    <div className="mt-4 space-y-2">
                      <span className="text-muted-foreground">Result:</span>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-500">
                            {(taskResult as { candidates_added?: number }).candidates_added || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Added</div>
                        </div>
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-yellow-500">
                            {(taskResult as { candidates_skipped?: number }).candidates_skipped || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Skipped</div>
                        </div>
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-blue-500">
                            {(taskResult as { candidates_with_x?: number }).candidates_with_x || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">With X</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col space-y-2">
                <span className="font-semibold flex items-center gap-2">
                  <Badge variant="outline">1</Badge>
                  GitHub Search
                </span>
                <p className="text-sm text-muted-foreground">
                  Search GitHub for developers matching your query, language, and location filters.
                </p>
              </div>
              <div className="flex flex-col space-y-2">
                <span className="font-semibold flex items-center gap-2">
                  <Badge variant="outline">2</Badge>
                  Profile Analysis
                </span>
                <p className="text-sm text-muted-foreground">
                  Analyze their repos, languages, stars, and contributions to calculate a developer score.
                </p>
              </div>
              <div className="flex flex-col space-y-2">
                <span className="font-semibold flex items-center gap-2">
                  <Badge variant="outline">3</Badge>
                  X Enrichment
                </span>
                <p className="text-sm text-muted-foreground">
                  If they have X/Twitter linked, fetch their profile and analyze tweets with AI.
                </p>
              </div>
              <div className="flex flex-col space-y-2">
                <span className="font-semibold flex items-center gap-2">
                  <Badge variant="outline">4</Badge>
                  Pipeline
                </span>
                <p className="text-sm text-muted-foreground">
                  Qualified developers are added to your job pipeline with match scores.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Search Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Use specific role titles: &quot;machine learning engineer&quot;</p>
              <p>• Filter by language for tech-specific roles</p>
              <p>• Higher min repos = more experienced developers</p>
              <p>• Location filter uses GitHub profile location</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
