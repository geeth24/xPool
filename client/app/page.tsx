"use client"

import * as React from "react"
import { motion } from "motion/react"
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
  developersCount: number
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
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

        setStats({
          totalCandidates: candidates.length,
          activeJobs: jobs.filter((j: Job) => j.status === "active").length,
          sourcedToday,
          developersCount: developers.length,
        })
      } catch (error) {
        console.error("Failed to fetch stats:", error)
        setStats({
          totalCandidates: 0,
          activeJobs: 0,
          sourcedToday: 0,
          developersCount: 0,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="flex-1 space-y-8 p-8 pt-6 gradient-bg min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-4xl font-bold tracking-tight">
            Dashboard
          </h2>
          <p className="text-muted-foreground mt-2 text-lg">
            Your AI-powered recruiting pipeline at a glance.
          </p>
        </div>
        <CreateJobDialog />
      </motion.div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={item}>
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Users className="h-4 w-4 text-foreground/70" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="text-3xl font-bold">
                  {stats?.totalCandidates.toLocaleString()}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Active in your pool
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-foreground/70" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="text-3xl font-bold">
                  {stats?.activeJobs}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Currently hiring
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sourced Today</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Zap className="h-4 w-4 text-foreground/70" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="text-3xl font-bold">
                  +{stats?.sourcedToday}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                New profiles
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Developers</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Brain className="h-4 w-4 text-foreground/70" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <div className="text-3xl font-bold">
                  {stats?.developersCount}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Verified engineers
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-7"
      >
        <Card className="col-span-4 gradient-card">
          <CardHeader>
            <CardTitle className="text-xl">Candidates by Job</CardTitle>
            <CardDescription>
              Sourced candidates per active job role.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview />
          </CardContent>
        </Card>
        <Card className="col-span-3 gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-xl">
              Recent Candidates
              <Button variant="ghost" size="sm" asChild className="text-xs group">
                <Link href="/candidates">
                  View All 
                  <ArrowUpRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
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
      </motion.div>
    </div>
  )
}
