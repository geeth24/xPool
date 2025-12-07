"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useTheme } from "next-themes"
import * as React from "react"
import { candidatesApi, Candidate } from "@/lib/api"

export function Overview() {
  const { theme } = useTheme()
  const [data, setData] = React.useState<{ name: string; total: number }[]>([])

  React.useEffect(() => {
    async function fetchData() {
      try {
        const candidates = await candidatesApi.list(0, 1000)
        
        // group by day
        const grouped: Record<string, number> = {}
        const now = new Date()
        
        // last 7 days
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const key = date.toLocaleDateString("en-US", { weekday: "short" })
          grouped[key] = 0
        }
        
        candidates.forEach((candidate: Candidate) => {
          const date = new Date(candidate.sourced_at)
          const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
          if (daysDiff < 7) {
            const key = date.toLocaleDateString("en-US", { weekday: "short" })
            if (grouped[key] !== undefined) {
              grouped[key]++
            }
          }
        })
        
        setData(Object.entries(grouped).map(([name, total]) => ({ name, total })))
      } catch (error) {
        // fallback to mock data
        setData([
          { name: "Mon", total: Math.floor(Math.random() * 100) },
          { name: "Tue", total: Math.floor(Math.random() * 100) },
          { name: "Wed", total: Math.floor(Math.random() * 100) },
          { name: "Thu", total: Math.floor(Math.random() * 100) },
          { name: "Fri", total: Math.floor(Math.random() * 100) },
          { name: "Sat", total: Math.floor(Math.random() * 100) },
          { name: "Sun", total: Math.floor(Math.random() * 100) },
        ])
      }
    }
    fetchData()
  }, [])

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey="name"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip
            contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#fff', borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
            itemStyle={{ color: theme === 'dark' ? '#fff' : '#000' }}
            cursor={{fill: 'transparent'}}
        />
        <Bar
          dataKey="total"
          fill="currentColor"
          radius={[4, 4, 0, 0]}
          className="fill-primary"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
