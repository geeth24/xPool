"use client"

import { Bar, BarChart, XAxis, YAxis } from "recharts"
import * as React from "react"
import { jobsApi, Job } from "@/lib/api"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

const chartConfig = {
  candidates: {
    label: "Candidates",
    theme: {
      light: "oklch(0.3211 0 0)",
      dark: "oklch(0.9 0 0)",
    },
  },
} satisfies ChartConfig

interface JobStats {
  name: string
  candidates: number
  avgScore: number
  jobId: string
}

export function Overview() {
  const [data, setData] = React.useState<JobStats[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function fetchData() {
      try {
        const jobs = await jobsApi.list()
        const activeJobs = jobs.filter((j: Job) => j.status === "active")
        
        const jobStats = await Promise.all(
          activeJobs.map(async (job: Job) => {
            try {
              const stats = await jobsApi.getStats(job.id)
              return {
                name: job.title.length > 15 ? job.title.substring(0, 15) + "..." : job.title,
                candidates: stats.total_candidates,
                avgScore: Math.round(stats.avg_score || 0),
                jobId: job.id,
              }
            } catch {
              return {
                name: job.title.length > 15 ? job.title.substring(0, 15) + "..." : job.title,
                candidates: 0,
                avgScore: 0,
                jobId: job.id,
              }
            }
          })
        )
        
        setData(jobStats)
      } catch (error) {
        console.error("Failed to fetch job stats:", error)
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="h-[350px] w-full flex items-center justify-center">
        <Skeleton className="h-[300px] w-full" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-[350px] w-full flex items-center justify-center text-muted-foreground">
        No active jobs yet. Create a job to start sourcing.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <BarChart data={data} accessibilityLayer layout="vertical" margin={{ left: 10, right: 30 }}>
        <XAxis
          type="number"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted)/0.3)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const item = payload[0].payload as JobStats
            return (
              <div className="rounded-lg border bg-background p-3 shadow-md">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.candidates} candidates
                </p>
                <p className="text-sm text-muted-foreground">
                  Avg match: {item.avgScore}%
                </p>
              </div>
            )
          }}
        />
        <Bar
          dataKey="candidates"
          fill="var(--color-candidates)"
          radius={[0, 4, 4, 0]}
          barSize={32}
        />
      </BarChart>
    </ChartContainer>
  )
}
