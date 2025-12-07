"use client"

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Overview } from "@/components/overview"
import { RecentCandidates } from "@/components/recent-candidates"
import { CreateJobDialog } from "@/components/create-job-dialog"
import { jobsApi, candidatesApi, Job, Candidate, CandidateType } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowUpRight, Users, Briefcase, Zap, Brain } from "lucide-react"

interface DashboardStats {
  totalCandidates: number
  activeJobs: number
  sourcedToday: number
  developerAccuracy: number
}

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function fetchStats() {
      try {
        const [jobs, candidates] = await Promise.all([
          jobsApi.list(),
          candidatesApi.list(0, 1000),
        ])

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const sourcedToday = candidates.filter((c: Candidate) => {
          const sourcedDate = new Date(c.sourced_at)
          return sourcedDate >= today
        }).length

        const developers = candidates.filter(
          (c: Candidate) => c.candidate_type === CandidateType.DEVELOPER
        )
        const withConfidence = developers.filter((c: Candidate) => c.type_confidence)
        const avgConfidence = withConfidence.length > 0
          ? withConfidence.reduce((acc: number, c: Candidate) => acc + (c.type_confidence || 0), 0) / withConfidence.length
          : 0

        setStats({
          totalCandidates: candidates.length,
          activeJobs: jobs.filter((j: Job) => j.status === "active").length,
          sourcedToday,
          developerAccuracy: Math.round(avgConfidence * 100),
        })
      } catch (error) {
        console.error("Failed to fetch stats:", error)
        // fallback stats
        setStats({
          totalCandidates: 0,
          activeJobs: 0,
          sourcedToday: 0,
          developerAccuracy: 0,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Your recruiting pipeline at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
           <CreateJobDialog />
        </div>
      </div>

      {/* Simplified Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalCandidates.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Active in your pool
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.activeJobs}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Currently hiring
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sourced Today</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">+{stats?.sourcedToday}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              New profiles
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Accuracy</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-2xl font-bold">{stats?.developerAccuracy}%</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Confidence score
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Candidate sourcing activity over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview />
          </CardContent>
        </Card>
        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Candidates
              <Button variant="ghost" size="sm" asChild className="text-xs">
                 <Link href="/candidates">View All <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Recently added to the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentCandidates />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
