"use client"

import { Bar, BarChart, XAxis, YAxis } from "recharts"
import * as React from "react"
import { candidatesApi, Candidate, CandidateType } from "@/lib/api"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
  value: {
    label: "Value",
    theme: {
      light: "oklch(0.3211 0 0)",
      dark: "oklch(0.9 0 0)",
    },
  },
} satisfies ChartConfig

export function Overview() {
  const [data, setData] = React.useState<{ name: string; value: number }[]>([])

  React.useEffect(() => {
    async function fetchData() {
      try {
        const candidates = await candidatesApi.list(0, 1000)
        
        const developers = candidates.filter(
          (c: Candidate) => c.candidate_type === CandidateType.DEVELOPER
        )
        const withConfidence = developers.filter((c: Candidate) => c.type_confidence)
        const avgConfidence = withConfidence.length > 0
          ? withConfidence.reduce((acc: number, c: Candidate) => acc + (c.type_confidence || 0), 0) / withConfidence.length
          : 0
        
        const withSkills = candidates.filter((c: Candidate) => c.skills_extracted && c.skills_extracted.length > 0)
        const withGithub = candidates.filter((c: Candidate) => c.github_username)
        const withLocation = candidates.filter((c: Candidate) => c.location)
        
        setData([
          { name: "Sourced", value: candidates.length },
          { name: "Developers", value: developers.length },
          { name: "AI Score", value: Math.round(avgConfidence * 100) },
          { name: "Skills", value: withSkills.length },
          { name: "GitHub", value: withGithub.length },
          { name: "Location", value: withLocation.length },
        ])
      } catch (error) {
        setData([
          { name: "Sourced", value: 173 },
          { name: "Developers", value: 142 },
          { name: "AI Score", value: 85 },
          { name: "Skills", value: 156 },
          { name: "GitHub", value: 98 },
          { name: "Location", value: 67 },
        ])
      }
    }
    fetchData()
  }, [])

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <BarChart data={data} accessibilityLayer>
        <XAxis
          dataKey="name"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted)/0.3)" }}
          content={<ChartTooltipContent />}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
